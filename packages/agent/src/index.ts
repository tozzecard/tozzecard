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

/**
 * Before every execution: the session must be live (it expires after 48h idle / 7 days and needs
 * the user's Binance App to renew), and Developer Mode must be off, since contract-call bypasses
 * the address book.
 */
export async function assertSafe() {
  const { status } = await cli.run<{ status: string }>(["wallet", "status"]);
  if (status !== "CONNECTED")
    throw new BawError(
      0,
      "SESSION_EXPIRED",
      "Agentic Wallet is signed out; sign in again in the Binance App.",
    );
  const s = await cli.run<{ devMode: { enabled: boolean } }>(["wallet", "settings"]);
  if (s.devMode.enabled)
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
  for (const end = Date.now() + timeoutMs; ; ) {
    const { list } = await cli.run<{ list: Order[] }>([
      "market-order",
      "list",
      "--orderId",
      orderId,
    ]);
    const order = list[0];
    if (order?.status === "FINISHED") return { quote: q, order };
    if (order?.status === "FAILED") throw new Error(`swap ${orderId} FAILED`);
    if (Date.now() > end) throw new Error(`swap ${orderId} still PENDING after ${timeoutMs}ms`);
    await Bun.sleep(pollMs);
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
  return [toUsdt, await swap(USDT, USD1, toUsdt.order.toTokenActualQty ?? "0")];
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
