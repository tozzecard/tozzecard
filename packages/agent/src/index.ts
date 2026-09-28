// Agent wallet: holds the stocks, buys, rebalances, refills the card.
// Owner: Fajar. Drives the user's Binance Agentic Wallet through the `baw` CLI.
// Invariant: stablecoin only ever leaves the agent wallet to the user's card address. Binance
// enforces this with the address book, but only while Developer Mode is off (docs/research.md §1),
// so every execution checks it.
import { BSC_CHAIN_ID } from "@tozzecard/binance";

export const USDT = "0x55d398326f99059fF775485246999027B3197955";
/** The card pays in USD1 through B402 (docs/plan.md §3.2). */
export const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d";
/** Binance rejects market orders below this (`30003001`). */
export const MIN_ORDER_USD = 5;

const BAW = require.resolve("@binance/agentic-wallet");

export class BawError extends Error {
  constructor(
    readonly code: number,
    readonly name: string,
    message: string,
  ) {
    super(message);
  }
}

export const cli = {
  async run<T>(args: string[]): Promise<T> {
    const proc = Bun.spawn(["bun", BAW, ...args, "--json"], { stdout: "pipe", stderr: "pipe" });
    const out =
      (await new Response(proc.stdout).text()) || (await new Response(proc.stderr).text());
    await proc.exited;
    const res = JSON.parse(out);
    if (!res.success) throw new BawError(res.error.code, res.error.name, res.error.message);
    return res.data as T;
  },
};

export interface Quote {
  fromCoinSymbol: string;
  fromCoinAmount: string;
  toCoinSymbol: string;
  toCoinAmount: string;
  slippage: number;
}

export interface Order {
  orderId: string;
  status: "PENDING" | "FINISHED" | "FAILED";
  fromToken: string;
  fromTokenQty: string;
  toToken: string;
  toTokenActualQty?: string;
  txHash: string | null;
}

export interface SwapResult {
  quote: Quote;
  order: Order;
}

export const quote = (from: string, to: string, qty: string) =>
  cli.run<Quote>([
    "market-order",
    "quote",
    "--fromTokenQty",
    qty,
    "--fromToken",
    from,
    "--toToken",
    to,
    "--binanceChainId",
    BSC_CHAIN_ID,
  ]);

export interface Session {
  connected: boolean;
  devMode?: boolean;
  /** Signs out at this time unless used again (48h idle). ISO with offset, as baw returns it. */
  sessionExpireTime?: string;
  /** Hard limit: re-sign-in in the Binance App needed by then (7 days). */
  signInMaxTime?: string;
  /** USD left of the wallet's daily limit today. */
  quotaLeft?: number;
}

/** For the scheduler (warn before expiry) and the UI. Read-only. */
export async function session(): Promise<Session> {
  const { status } = await cli.run<{ status: string }>(["wallet", "status"]);
  if (status !== "CONNECTED") return { connected: false };
  const s = await cli.run<{
    devMode: { enabled: boolean };
    sessionExpireTime: string;
    signInMaxTime: string;
    quotaLeft: number;
  }>(["wallet", "settings"]);
  return {
    connected: true,
    devMode: s.devMode.enabled,
    sessionExpireTime: s.sessionExpireTime,
    signInMaxTime: s.signInMaxTime,
    quotaLeft: s.quotaLeft,
  };
}

/**
 * Before every execution: the session must be live (it expires after 48h idle / 7 days and needs
 * the user's Binance App to renew), and Developer Mode must be off, since contract-call bypasses
 * the address book.
 */
export async function assertSafe() {
  const s = await session();
  if (!s.connected)
    throw new BawError(
      0,
      "SESSION_EXPIRED",
      "Agentic Wallet is signed out; sign in again in the Binance App.",
    );
  if (s.devMode)
    throw new Error(
      "Developer Mode is on; it bypasses the card allowlist. Turn it off in the Binance App.",
    );
}

/** Quote, swap, then poll until the order is terminal. A submitted orderId is not a done swap. */
export async function swap(
  from: string,
  to: string,
  qty: string,
  slippage = "1",
  pollMs = 3000,
  timeoutMs = 90_000,
): Promise<SwapResult> {
  await assertSafe();
  const q = await quote(from, to, qty);
  const since = Date.now() - 10_000;
  const { orderId } = await cli.run<{ orderId: string }>([
    "market-order",
    "swap",
    "--fromTokenQty",
    qty,
    "--fromToken",
    from,
    "--toToken",
    to,
    "--binanceChainId",
    BSC_CHAIN_ID,
    "--slippage",
    slippage,
  ]);
  // The orderId from `swap` is not always the order that runs: on a token's first use (approval)
  // it returned id N while the swap was listed as N+1, and `list --orderId N` stayed empty. So look
  // the order up by pair + time: the exact id, else a later one. Never an earlier one: after a
  // failed swap and an immediate retry, the old FAILED order would decide the new swap's outcome.
  for (const end = Date.now() + timeoutMs; ; ) {
    const { list } = await cli.run<{ list: Order[] }>([
      "market-order",
      "list",
      "--fromToken",
      from,
      "--toToken",
      to,
      "--startTime",
      String(since),
    ]);
    const order = list.find((o) => o.orderId === orderId) ?? list.find((o) => isLater(o, orderId));
    if (order?.status === "FINISHED") return { quote: q, order };
    if (order?.status === "FAILED") throw new Error(`swap ${orderId} FAILED`);
    if (Date.now() > end) throw new Error(`swap ${orderId} still PENDING after ${timeoutMs}ms`);
    await Bun.sleep(pollMs);
  }
}

/** Order ids are numeric strings that grow (observed N returned, N+1 executed). */
function isLater(o: Order, orderId: string) {
  try {
    return BigInt(o.orderId) > BigInt(orderId);
  } catch {
    return false;
  }
}

export const buy = (token: string, usdt: string) => swap(USDT, token, usdt);
export const sell = (token: string, amount: string) => swap(token, USDT, amount);

/**
 * Sell stock into USD1 for the card. bStocks swap to USD1 directly; Ondo only settles to USDT
 * (`103` "one side must be a supported stablecoin"), so Ondo goes token → USDT → USD1.
 * The `103` comes from the quote, before any order is placed.
 */
export async function sellForCard(token: string, amount: string): Promise<SwapResult[]> {
  try {
    return [await swap(token, USD1, amount)];
  } catch (e) {
    if (!(e instanceof BawError && e.code === 103)) throw e;
  }
  const toUsdt = await sell(token, amount);
  const usdt = toUsdt.order.toTokenActualQty;
  // The stock is sold and the USDT sits in the agent wallet; the caller can finish USDT → USD1.
  if (!usdt)
    throw new Error(
      `sold ${token} (order ${toUsdt.order.orderId}) but baw reported no USDT amount`,
    );
  return [toUsdt, await swap(USDT, USD1, usdt)];
}

/** Send USD1 to the card. Binance rejects any address not in the address book (`351703`). */
export async function refill(cardAddress: string, usd1: string): Promise<string> {
  await assertSafe();
  const { txHash } = await cli.run<{ txHash: string }>([
    "wallet",
    "send",
    "--amount",
    usd1,
    "--recipient",
    cardAddress,
    "--binanceChainId",
    BSC_CHAIN_ID,
    "--tokenAddress",
    USD1,
  ]);
  return txHash;
}

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

/**
 * Pure: trades that bring `holdings` back to `targets` (address → weight, sums to 1).
 * Idle USDT is part of the portfolio with weight 0. Returns [] unless some token drifts more
 * than `drift` (absolute weight). Legs under MIN_ORDER_USD are skipped. Sells come first.
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
      return { token: g.a, side: "sell", usd: -g.usd, qty: floorTo(units, 8) };
    });
  const buys: Trade[] = gaps
    .filter((g) => g.usd >= MIN_ORDER_USD)
    .map((g) => ({ token: g.a, side: "buy", usd: g.usd, qty: g.usd.toFixed(6) }));
  return [...sells, ...buys];
}

const floorTo = (x: number, dp: number) => (Math.floor(x * 10 ** dp) / 10 ** dp).toFixed(dp);

export const holdings = () =>
  cli.run<Holding[]>(["wallet", "balance", "--binanceChainId", BSC_CHAIN_ID]);

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
    const trade = { ...t, usd: t.usd * k, qty: (t.usd * k).toFixed(6) };
    if (trade.usd < MIN_ORDER_USD) continue;
    results.push({ trade, swap: await buy(trade.token, trade.qty).catch(fail) });
  }
  return results;
}
