// Portfolio: wallet holdings, the pure rebalance plan, and executing it (plan §3.5).
import { BSC_CHAIN_ID } from "@tozzecard/binance";
import { cli } from "../baw/cli";
import { MIN_ORDER_USD, USDT } from "../constants";
import { buy, type SwapResult, sell } from "../trading/swap";

export interface Holding {
  symbol: string;
  address: string;
  balance: string;
  price: string;
  value: string;
}

export interface Trade {
  token: string;
  side: "sell" | "buy";
  usd: number;
  /** Token units for sells, USDT for buys, as `baw --fromTokenQty` expects. */
  qty: string;
}

export const holdings = () =>
  cli.run<Holding[]>(["wallet", "balance", "--binanceChainId", BSC_CHAIN_ID]);

/** Round down to `dp` decimals, so an amount never exceeds what it was derived from. */
const floorTo = (x: number, dp: number) => (Math.floor(x * 10 ** dp) / 10 ** dp).toFixed(dp);

/**
 * Pure: trades that bring `holdings` back to `targets` (address → weight, sums to 1).
 * Idle USDT is part of the portfolio with weight 0. Returns [] unless some token drifts more
 * than `drift` (absolute weight). Legs under MIN_ORDER_USD are skipped. Sells come first.
 * Only tokens in `targets` are touched: to exit a position, keep it with weight 0 (then the full
 * balance is sold). Anything else in the wallet (airdrops, dust) is left alone on purpose.
 */
export function planRebalance(
  holdings: Holding[],
  targets: Record<string, number>,
  drift = 0.05,
): Trade[] {
  const lc = (a: string) => a.toLowerCase();
  const held = new Map(holdings.map((h) => [lc(h.address), h]));
  const tokens = Object.keys(targets).map(lc);
  const target = new Map(Object.entries(targets).map(([a, w]) => [lc(a), w]));
  const value = (a: string) => Number(held.get(a)?.value ?? 0);
  const total = tokens.reduce((s, a) => s + value(a), 0) + value(lc(USDT));
  if (total === 0) return [];
  const gaps = tokens.map((a) => ({ a, usd: (target.get(a) ?? 0) * total - value(a) }));
  if (!gaps.some((g) => Math.abs(g.usd) / total > drift)) return [];
  const sells: Trade[] = gaps
    .filter((g) => -g.usd >= MIN_ORDER_USD)
    .map((g) => {
      const h = held.get(g.a);
      // Round down and cap at the balance: toFixed rounds half up and can ask for more than held.
      const units = Math.min(-g.usd / Number(h?.price), Number(h?.balance ?? 0));
      // A full exit sells the exact balance string: no float round-trip leaves dust behind.
      const exit = (target.get(g.a) ?? 0) === 0 && h?.balance;
      return { token: g.a, side: "sell", usd: -g.usd, qty: exit || floorTo(units, 8) };
    });
  const buys: Trade[] = gaps
    .filter((g) => g.usd >= MIN_ORDER_USD)
    .map((g) => ({ token: g.a, side: "buy", usd: g.usd, qty: floorTo(g.usd, 6) }));
  return [...sells, ...buys];
}

/** Sell overweight, then buy underweight. Stops at the first failure; results so far are returned on the error. */
export async function rebalance(targets: Record<string, number>, drift = 0.05) {
  const results: { trade: Trade; swap: SwapResult }[] = [];
  const fail = (e: Error) => Promise.reject(Object.assign(e, { results }));
  const plan = planRebalance(await holdings(), targets, drift);
  for (const trade of plan.filter((t) => t.side === "sell")) {
    results.push({ trade, swap: await sell(trade.token, trade.qty).catch(fail) });
  }
  // Sells return a bit less than planned (fees, slippage): scale buys to the USDT we actually have.
  const buys = plan.filter((t) => t.side === "buy");
  const want = buys.reduce((s, t) => s + t.usd, 0);
  const have = buys.length
    ? Number(
        (await holdings()).find((h) => h.address.toLowerCase() === USDT.toLowerCase())?.balance ??
          0,
      )
    : 0;
  const k = Math.min(1, have / want);
  for (const t of buys) {
    const trade = { ...t, usd: t.usd * k, qty: floorTo(t.usd * k, 6) };
    if (trade.usd < MIN_ORDER_USD) continue;
    results.push({ trade, swap: await buy(trade.token, trade.qty).catch(fail) });
  }
  return results;
}
