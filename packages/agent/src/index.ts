// Agent wallet: holds the stocks, buys, rebalances, refills the card.
// Owner: Fajar. Drives the Binance Agentic Wallet through the `baw` CLI (spike #2).
// Invariant: USDT only ever leaves the agent wallet to the user's card address. Binance enforces
// this with the address book, but only while Developer Mode is off, so every execution checks it.
import { BSC_CHAIN_ID } from "@tozzecard/binance";

export const USDT = "0x55d398326f99059fF775485246999027B3197955";
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

/** Refuse to act while Developer Mode is on: contract-call bypasses the address book (spike #2). */
export async function assertSafe() {
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

/** Send USDT to the card. Binance rejects any address not in the address book (`351703`). */
export async function refill(cardAddress: string, usdt: string): Promise<string> {
  await assertSafe();
  const { txHash } = await cli.run<{ txHash: string }>([
    "wallet",
    "send",
    "--amount",
    usdt,
    "--recipient",
    cardAddress,
    "--binanceChainId",
    BSC_CHAIN_ID,
    "--tokenAddress",
    USDT,
  ]);
  return txHash;
}
