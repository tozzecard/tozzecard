// Refill planner (plan §3.3–3.4). Pure: decides whether to top up the card now, how much, and
// from which stock, with a reason a person can read. Executing it (packages/agent sellForCard +
// refill) is the scheduler's job.
import { isRegularOpen, nextClose, nextOpen } from "./calendar";
import type { Forecast } from "./forecast";

/** Binance rejects market orders below this (agent MIN_ORDER_USD, `30003001`). */
export const MIN_ORDER_USD = 5;

export interface Position {
  symbol: string;
  address: string;
  valueUsd: number;
  /** Target weight in the portfolio, 0–1. */
  target: number;
  /** On-chain price vs the frozen close (market.ts spreadVsClose); null until a close is seen. */
  spread: number | null;
  /** False when the token is paused, limited or unsupported. */
  sellable: boolean;
}

export interface RefillConfig {
  buffer: number;
  /** Card balance (USD) under which we refill even outside the pre-close window. */
  floorUsd: number;
  /** Refill during the last N minutes before the close. */
  closeWindowMin: number;
  /** When the market is shut, only sell if |spread| is at most this. */
  maxClosedSpread: number;
}

export const DEFAULTS: RefillConfig = {
  buffer: 1.2,
  floorUsd: 10,
  closeWindowMin: 30,
  maxClosedSpread: 0.01,
};

export type Decision =
  | { action: "none"; reason: string; needUsd: number; horizon: number }
  | {
      action: "refill";
      usd: number;
      symbol: string;
      address: string;
      reason: string;
      needUsd: number;
      horizon: number;
    }
  | {
      action: "hold";
      reason: string;
      needUsd: number;
      horizon: number;
      symbol?: string;
      spread?: number;
    };

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const time = (t: number) =>
  new Date(t).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function planRefill(input: {
  now: number;
  cardUsd: number;
  forecast: Forecast;
  positions: Position[];
  config?: Partial<RefillConfig>;
}): Decision {
  const { now, cardUsd, forecast, positions } = input;
  const cfg = { ...DEFAULTS, ...input.config };
  const open = isRegularOpen(now);

  // Cover spending until we can next sell at a real price: after the coming close, the next open.
  const horizon = open ? nextOpen(nextClose(now)) : nextOpen(now);
  const needUsd = forecast.need(now, horizon) * cfg.buffer;
  // The floor is a balance we always keep, whatever the forecast says.
  const short = Math.max(needUsd, cfg.floorUsd) - cardUsd;
  const base = { needUsd, horizon };
  const until = `until ${time(horizon)} NY`;

  if (short <= 0) {
    return {
      action: "none",
      reason: `Card has ${usd(cardUsd)}, enough for the ${usd(needUsd)} expected ${until}.`,
      ...base,
    };
  }

  const sellable = (amount: number) => positions.filter((p) => p.sellable && p.valueUsd >= amount);

  if (open) {
    const amount = Math.max(short, MIN_ORDER_USD);
    const candidates = sellable(amount);
    const minutesLeft = (nextClose(now) - now) / 60_000;
    const low = cardUsd < cfg.floorUsd;
    if (minutesLeft > cfg.closeWindowMin && !low) {
      return {
        action: "none",
        reason: `Short ${usd(short)} ${until}; refilling in the last ${cfg.closeWindowMin} min before the close.`,
        ...base,
      };
    }
    const pick = mostOverweight(candidates, positions);
    if (!pick) return noStock(amount, base);
    const why = low ? `card is below ${usd(cfg.floorUsd)}` : "market closes soon";
    return {
      action: "refill",
      usd: amount,
      symbol: pick.symbol,
      address: pick.address,
      reason: `Selling ${usd(amount)} of ${pick.symbol} (most overweight) while the market is open: ${why}, and you usually spend ${usd(needUsd)} ${until}.`,
      ...base,
    };
  }

  // Market shut: only an emergency justifies selling at an unanchored price.
  if (cardUsd >= cfg.floorUsd) {
    return {
      action: "none",
      reason: `Market closed; short ${usd(short)} ${until} but the card is above ${usd(cfg.floorUsd)}. Waiting for the open.`,
      ...base,
    };
  }
  // Sell only what gets the card back to the floor; the rest waits for a real price.
  const amount = Math.max(cfg.floorUsd - cardUsd, MIN_ORDER_USD);
  const pick = sellable(amount)
    .filter((p) => p.spread !== null)
    .sort((a, b) => Math.abs(a.spread as number) - Math.abs(b.spread as number))[0];
  if (!pick) return noStock(amount, base);
  const spread = pick.spread as number;
  if (Math.abs(spread) > cfg.maxClosedSpread) {
    return {
      action: "hold",
      symbol: pick.symbol,
      spread,
      reason: `Card is low (${usd(cardUsd)}) but the market is closed and the best price is ${pct(spread)} off Friday's close (${pick.symbol}). Selling now would cost you; waiting for ${time(horizon)} NY.`,
      ...base,
    };
  }
  return {
    action: "refill",
    usd: amount,
    symbol: pick.symbol,
    address: pick.address,
    reason: `Card is low (${usd(cardUsd)}) and the market is closed. ${pick.symbol} trades within ${pct(Math.abs(spread))} of the close, so selling the minimum ${usd(amount)} now.`,
    ...base,
  };
}

/** Plan §3.4: the position furthest above its target weight; ties by smaller |spread|. */
function mostOverweight(candidates: Position[], all: Position[]) {
  const total = all.reduce((s, p) => s + p.valueUsd, 0) || 1;
  const over = (p: Position) => p.valueUsd / total - p.target;
  return [...candidates].sort(
    (a, b) => over(b) - over(a) || Math.abs(a.spread ?? 0) - Math.abs(b.spread ?? 0),
  )[0];
}

function noStock(amount: number, base: { needUsd: number; horizon: number }): Decision {
  return {
    action: "hold",
    reason: `Need ${usd(amount)} but no sellable position is large enough.`,
    ...base,
  };
}
