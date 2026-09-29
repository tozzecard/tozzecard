// Market-order swaps: quote, submit, poll to a terminal state. Plus the sell path into USD1.
import { BSC_CHAIN_ID } from "@tozzecard/binance";
import { BawError, cli } from "../baw/cli";
import { USD1, USDT } from "../constants";
import { assertSafe } from "../wallet/session";

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
