// Backend: market-hours reader, spend forecaster, refill/rebalance scheduler, agent decision log.
// Owner: Kiel. See docs/plan.md §3.
import { Database } from "bun:sqlite";
import * as agent from "@tozzecard/agent";
import { clientFromEnv } from "@tozzecard/binance";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { bsc } from "viem/chains";
import { createMarket } from "./market";
import { createMerchant, PAYMENT_HEADER, RECEIPT_HEADER, USD1 } from "./merchant";
import { createScheduler, type SchedulerConfig } from "./scheduler";

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

// The web app (apps/web) calls us from the browser. PAYMENT-RESPONSE carries the B402 receipt.
app.use(
  "*",
  cors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
    exposeHeaders: [RECEIPT_HEADER],
  }),
);

// JSON errors for the app, with baw's name (SESSION_EXPIRED, TIMEOUT) so the UI can say why.
app.onError((e, c) => {
  console.error(e);
  const name = (e as { name?: string }).name;
  return c.json({ error: e.message, code: name && name !== "Error" ? name : undefined }, 502);
});

app.get("/health", (c) => c.json({ ok: true, marketPolledAt: market.lastPoll() || null }));

app.get("/market", (c) => c.json(market.all()));

app.get("/market/:symbol", (c) => {
  const view = market.get(c.req.param("symbol"));
  return view ? c.json(view) : c.json({ error: "unknown symbol" }, 404);
});

// Demo merchant (plan §3.2). payTo must equal the write-once address set in the B402 portal.
const payTo = process.env.MERCHANT_PAY_TO;
const merchant = payTo ? createMerchant({ client, db, payTo }) : null;
if (merchant) {
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

// Refill scheduler (plan §3.3). Off unless AGENT_MODE is "dry" (log only) or "live" (trades).
const mode = process.env.AGENT_MODE;
if (mode === "dry" || mode === "live") {
  const env = process.env;
  const config: SchedulerConfig = {
    mode,
    card: String(env.CARD_ADDRESS),
    targets: JSON.parse(env.AGENT_TARGETS ?? "{}"),
    weeklyEstimateUsd: Number(env.WEEKLY_ESTIMATE_USD ?? 0),
    tzOffsetMinutes: Number(env.TZ_OFFSET_MIN ?? 420),
    cardCreatedAt: Date.parse(env.CARD_CREATED_AT ?? "") || Date.now(),
  };
  if (!/^0x[0-9a-fA-F]{40}$/.test(config.card)) throw new Error("CARD_ADDRESS must be set");
  const rpc = createPublicClient({ chain: bsc, transport: http(env.BSC_RPC_URL) });
  const cardBalanceUsd = async () =>
    Number(
      formatUnits(
        await rpc.readContract({
          address: USD1.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [config.card as `0x${string}`],
        }),
        USD1.decimals,
      ),
    );
  const scheduler = createScheduler({
    db,
    config,
    agent,
    markets: market.all,
    cardBalanceUsd,
    spends: () => merchant?.spendsOf(config.card) ?? [],
  });

  // Plan after the market has data; the scheduler guards its own overlap.
  setInterval(() => {
    if (market.lastPoll())
      scheduler.tick().catch((e) => console.error("scheduler tick failed:", e));
  }, POLL_MS);

  app.get("/agent/decisions", (c) => c.json(scheduler.log(Number(c.req.query("limit") ?? 50))));
  app.get("/agent/session", async (c) => c.json(await agent.session()));

  // Portfolio screen: agent wallet holdings (with weights vs targets and market data) + card.
  // ponytail: every call runs baw (a few seconds); cache it if the UI polls often.
  const targets = new Map(
    Object.entries(config.targets).map(([a, w]) => [a.toLowerCase(), w] as const),
  );
  app.get("/portfolio", async (c) => {
    const [held, cardUsd] = await Promise.all([agent.holdings(), cardBalanceUsd()]);
    const byAddress = new Map(market.all().map((m) => [m.address, m]));
    const totalUsd = held.reduce((s, h) => s + Number(h.value), 0);
    return c.json({
      card: { address: config.card, usd1: cardUsd },
      totalUsd,
      holdings: held.map((h) => {
        const address = h.address.toLowerCase();
        const m = byAddress.get(address);
        return {
          symbol: h.symbol,
          address,
          balance: h.balance,
          valueUsd: Number(h.value),
          weight: totalUsd ? Number(h.value) / totalUsd : 0,
          target: targets.get(address) ?? 0,
          market: m
            ? {
                ticker: m.ticker,
                platform: m.platform,
                status: m.status,
                tokenPrice: m.tokenPrice,
                closeRef: m.closeRef,
                spreadVsClose: m.spreadVsClose,
              }
            : null,
        };
      }),
    });
  });
  // Time travel for the demo: /agent/preview?at=2026-10-02T19:40:00Z. Never trades.
  app.get("/agent/preview", async (c) => {
    const at = Date.parse(c.req.query("at") ?? "") || Date.now();
    return c.json({ at, mode, decision: await scheduler.preview(at) });
  });
  console.log(`scheduler on (${mode}), card ${config.card}`);
} else {
  console.warn("AGENT_MODE not dry/live: scheduler off");
}

// PORT is set by docker-compose.yml; API_PORT for local runs.
export default {
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 8787),
  fetch: app.fetch,
  // /agent/* shell out to baw (a few seconds each); Bun's default 10 s would cut them off.
  idleTimeout: 120,
};
