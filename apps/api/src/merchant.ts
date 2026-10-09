// Demo merchant: sells an order for USD1 through B402. A real merchant runs this on their own
// server with their own B402 key; we run one so the card has somewhere to pay (plan §3.2).
// Flow (x402 v2): GET pay → 402 + requirements; retry with PAYMENT-SIGNATURE → verify → settle.
import type { Database } from "bun:sqlite";
import { isDeepStrictEqual } from "node:util";
import {
  B402_NETWORK,
  type B402Kind,
  type BinanceClient,
  b402Settle,
  b402Supported,
  b402Verify,
  type PaymentPayload,
  type PaymentRequirements,
} from "@tozzecard/binance";
import { formatUnits, parseUnits } from "viem";

// USD1 on BSC, EIP-712 domain read from the contract (eip712Domain()).
export const USD1 = {
  address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
  domainName: "World Liberty Financial USD",
  decimals: 18,
};

export const PAYMENT_HEADER = "PAYMENT-SIGNATURE";
export const RECEIPT_HEADER = "PAYMENT-RESPONSE";
const KIND_TTL_MS = 10 * 60_000; // docs: copy `extra` from /supported and refresh periodically

export interface Order {
  id: string;
  amount: string; // USD1 smallest unit
  description: string;
  status: "open" | "paid";
  payer: string | null;
  tx: string | null;
  createdAt: number;
}

export type PayResult =
  | { status: 402; body: { x402Version: 2; accepts: PaymentRequirements[]; error?: string } }
  | { status: 200; order: Order }
  | { status: 400 | 404 | 502; body: { error: string } };

export function createMerchant(opts: { client: BinanceClient; db: Database; payTo: string }) {
  const { client, db, payTo } = opts;
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, amount TEXT NOT NULL, description TEXT NOT NULL,
    status TEXT NOT NULL, payer TEXT, tx TEXT, created_at INTEGER NOT NULL)`);
  const read = db.prepare<Record<string, string | number | null>, [string]>(
    "SELECT * FROM orders WHERE id = ?",
  );
  const markPaid = db.prepare(
    "UPDATE orders SET status = 'paid', payer = ?2, tx = ?3 WHERE id = ?1",
  );

  let kind: { value: B402Kind; at: number } | null = null;
  async function usd1Kind() {
    if (kind && Date.now() - kind.at < KIND_TTL_MS) return kind.value;
    const { kinds } = await b402Supported(client);
    const k = kinds.find(
      (x) =>
        x.network === B402_NETWORK &&
        x.scheme === "exact" &&
        x.extra.assetTransferMethod === "eip3009" &&
        x.extra.name === USD1.domainName,
    );
    if (!k) throw new Error("B402 /supported has no exact eip3009 USD1 kind on BSC");
    kind = { value: k, at: Date.now() };
    return k;
  }

  const toOrder = (r: Record<string, string | number | null>): Order => ({
    id: String(r.id),
    amount: String(r.amount),
    description: String(r.description),
    status: r.status as Order["status"],
    payer: r.payer as string | null,
    tx: r.tx as string | null,
    createdAt: Number(r.created_at),
  });

  function get(id: string): Order | null {
    const r = read.get(id);
    return r ? toOrder(r) : null;
  }

  /** Paid orders of one payer (a card), newest first. */
  const paidBy = (payer: string): Order[] =>
    (
      db
        .query(
          "SELECT * FROM orders WHERE status = 'paid' AND lower(payer) = ? ORDER BY created_at DESC",
        )
        .all(payer.toLowerCase()) as Record<string, string | number | null>[]
    ).map(toOrder);

  function create(amountUsd: string, description: string): Order {
    const amount = parseUnits(amountUsd, USD1.decimals);
    if (amount <= 0n) throw new Error("amount must be positive");
    const id = crypto.randomUUID();
    db.run("INSERT INTO orders VALUES (?, ?, ?, 'open', NULL, NULL, ?)", [
      id,
      amount.toString(),
      description,
      Date.now(),
    ]);
    return get(id) as Order;
  }

  // Built server-side every time; the buyer's copy is only compared against it.
  async function requirements(order: Order): Promise<PaymentRequirements> {
    const k = await usd1Kind();
    return {
      scheme: "exact",
      network: B402_NETWORK,
      amount: order.amount,
      asset: USD1.address,
      payTo,
      maxTimeoutSeconds: 300,
      extra: k.extra,
    };
  }

  async function pay(id: string, header: string | undefined): Promise<PayResult> {
    const order = get(id);
    if (!order) return { status: 404, body: { error: "unknown order" } };
    if (order.status === "paid") return { status: 200, order };

    const reqs = await requirements(order);
    if (!header) return { status: 402, body: { x402Version: 2, accepts: [reqs] } };

    let payload: PaymentPayload;
    try {
      payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      return { status: 400, body: { error: `${PAYMENT_HEADER} is not base64 JSON` } };
    }
    // Docs: reject unless accepted exactly matches what the server holds (amount, payTo, ...).
    if (!isDeepStrictEqual(payload.accepted, reqs)) {
      return {
        status: 402,
        body: { x402Version: 2, accepts: [reqs], error: "accepted does not match requirements" },
      };
    }

    const v = await b402Verify(client, payload, reqs);
    if (!v.isValid) {
      return {
        status: 402,
        body: { x402Version: 2, accepts: [reqs], error: v.invalidReason ?? "invalid payment" },
      };
    }

    // Settle is idempotent for the same signed authorization, so a retry after a crash is safe.
    const s = await b402Settle(client, payload, reqs);
    if (!s.success) {
      return { status: 502, body: { error: s.errorReason ?? s.errorMessage ?? "settle failed" } };
    }
    markPaid.run(id, s.payer, s.transaction);
    return { status: 200, order: get(id) as Order };
  }

  return {
    create,
    get,
    pay,
    formatAmount: (o: Order) => formatUnits(BigInt(o.amount), USD1.decimals),
    paidBy,
    /** Paid orders of one payer, as spends for the forecaster. */
    spendsOf: (payer: string) =>
      paidBy(payer).map((o) => ({
        at: o.createdAt,
        usd: Number(formatUnits(BigInt(o.amount), USD1.decimals)),
      })),
  };
}

export type Merchant = ReturnType<typeof createMerchant>;
