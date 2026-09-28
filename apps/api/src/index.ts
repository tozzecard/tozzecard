// Backend: market-hours reader, spend forecaster, refill/rebalance scheduler, agent decision log.
// Owner: Kiel. See docs/plan.md §3.
import { Database } from "bun:sqlite";
import { clientFromEnv } from "@tozzecard/binance";
import { Hono } from "hono";
import { createMarket } from "./market";
import { createMerchant, PAYMENT_HEADER, RECEIPT_HEADER } from "./merchant";

const POLL_MS = Number(process.env.MARKET_POLL_MS ?? 60_000);

const client = clientFromEnv();
const db = new Database(process.env.DB_PATH ?? "tozzecard.sqlite");
const market = createMarket(client, db);

let polling = false;
async function tick() {
  if (polling) return;
  polling = true;
  try {
    await market.poll();
  } catch (e) {
    // Keep serving the last snapshot; the next tick retries.
    console.error("market poll failed:", e);
  } finally {
    polling = false;
  }
}
tick();
setInterval(tick, POLL_MS);

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, marketPolledAt: market.lastPoll() || null }));

app.get("/market", (c) => c.json(market.all()));

app.get("/market/:symbol", (c) => {
  const view = market.get(c.req.param("symbol"));
  return view ? c.json(view) : c.json({ error: "unknown symbol" }, 404);
});

// Demo merchant (plan §3.2). payTo must equal the write-once address set in the B402 portal.
const payTo = process.env.MERCHANT_PAY_TO;
if (payTo) {
  const merchant = createMerchant({ client, db, payTo });

  app.post("/merchant/orders", async (c) => {
    const { amount, description } = await c.req.json<{ amount?: string; description?: string }>();
    try {
      const order = merchant.create(String(amount), String(description ?? ""));
      return c.json({ ...order, amountUsd: merchant.formatAmount(order) }, 201);
    } catch {
      return c.json({ error: 'amount must be a positive decimal, e.g. "2.50"' }, 400);
    }
  });

  app.get("/merchant/orders/:id", (c) => {
    const order = merchant.get(c.req.param("id"));
    return order ? c.json(order) : c.json({ error: "unknown order" }, 404);
  });

  // x402: without PAYMENT-SIGNATURE → 402 + requirements; with it → verify, settle, receipt.
  app.on(["GET", "POST"], "/merchant/orders/:id/pay", async (c) => {
    try {
      const r = await merchant.pay(c.req.param("id"), c.req.header(PAYMENT_HEADER));
      if (r.status !== 200) return c.json(r.body, r.status);
      c.header(RECEIPT_HEADER, Buffer.from(JSON.stringify({ tx: r.order.tx })).toString("base64"));
      return c.json(r.order);
    } catch (e) {
      console.error("merchant pay failed:", e);
      return c.json({ error: "payment facilitator unavailable" }, 502);
    }
  });
} else {
  console.warn("MERCHANT_PAY_TO not set: /merchant routes disabled");
}

// PORT is set by the host (Railway); API_PORT for local runs.
export default { port: Number(process.env.PORT ?? process.env.API_PORT ?? 8787), fetch: app.fetch };
