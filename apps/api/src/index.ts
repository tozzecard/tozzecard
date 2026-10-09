// Backend: market-hours reader, spend forecaster, refill/rebalance scheduler, agent decision log.
// Owner: Kiel. See docs/plan.md §3.
import { Database } from "bun:sqlite";
import * as agent from "@tozzecard/agent";
import { clientFromEnv } from "@tozzecard/binance";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPublicClient, erc20Abi, formatEther, formatUnits, getAddress, http } from "viem";
import { bsc } from "viem/chains";
import { cleanHolder, createCards } from "./card";
import { createMarket } from "./market";
import { createMerchant, PAYMENT_HEADER, RECEIPT_HEADER, USD1 } from "./merchant";
import { createScheduler, type Scheduler, type SchedulerConfig } from "./scheduler";
import { createStrategyStore, parseStrategy } from "./strategy";

const POLL_MS = Number(process.env.MARKET_POLL_MS ?? 60_000);

const client = clientFromEnv();
const db = new Database(process.env.DB_PATH ?? "tozzecard.sqlite");
const market = createMarket(client, db);
const cards = createCards(db);
const strategies = createStrategyStore(db);
const rpc = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL) });

/** A card's balances: USD1 to spend, BNB to show it needs none. */
async function balances(address: string) {
  const a = address as `0x${string}`;
  const [usd1, bnb] = await Promise.all([
    rpc.readContract({
      address: USD1.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [a],
    }),
    rpc.getBalance({ address: a }),
  ]);
  return { usd1: Number(formatUnits(usd1, USD1.decimals)), bnb: Number(formatEther(bnb)) };
}

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

// Card sign-in (card.ts): challenge → the card key signs it → bearer token. First sign-in issues
// the card. Everything under /me needs `Authorization: Bearer <token>`.
app.post("/auth/challenge", async (c) => {
  const { address } = await c.req.json<{ address?: string }>().catch(() => ({ address: "" }));
  try {
    return c.json(cards.challenge(String(address)));
  } catch {
    return c.json({ error: "address must be a 0x address" }, 400);
  }
});

app.post("/auth/verify", async (c) => {
  const body = await c.req
    .json<{ message?: string; signature?: string; holder?: string }>()
    .catch(() => ({}) as Record<string, undefined>);
  if (!body.message || !body.signature)
    return c.json({ error: "message and signature are required" }, 400);
  const r = await cards.signIn(body.message, body.signature, cleanHolder(body.holder));
  return r
    ? c.json(r, r.created ? 201 : 200)
    : c.json({ error: "invalid or expired signature" }, 401);
});

app.post("/auth/signout", (c) => {
  cards.signOut(c.req.header("authorization"));
  return c.body(null, 204);
});

const agentMode =
  process.env.AGENT_MODE === "dry" || process.env.AGENT_MODE === "live"
    ? process.env.AGENT_MODE
    : "off";
// The one card this server's Agentic Wallet refills (its address book holds only this address).
const agentCard = /^0x[0-9a-fA-F]{40}$/.test(process.env.CARD_ADDRESS ?? "")
  ? getAddress(String(process.env.CARD_ADDRESS))
  : null;
let scheduler: Scheduler | null = null;

const me = (c: { req: { header: (n: string) => string | undefined } }) =>
  cards.auth(c.req.header("authorization"));
const unauthorized = { error: "sign in first", code: "UNAUTHORIZED" };

app.get("/me", async (c) => {
  const card = me(c);
  if (!card) return c.json(unauthorized, 401);
  return c.json({
    card,
    balance: await balances(card.address),
    agent: { linked: card.address === agentCard, mode: agentMode },
  });
});

app.patch("/me", async (c) => {
  const card = me(c);
  if (!card) return c.json(unauthorized, 401);
  const { holder } = await c.req.json<{ holder?: string }>().catch(() => ({ holder: "" }));
  const name = cleanHolder(holder);
  if (!name) return c.json({ error: "holder: letters, spaces, . ' - up to 26 characters" }, 400);
  return c.json({ card: cards.rename(card.address, name) });
});

// The card's statement: payments it made, refills the agent sent it. Newest first.
app.get("/me/activity", (c) => {
  const card = me(c);
  if (!card) return c.json(unauthorized, 401);
  const payments = (merchant?.paidBy(card.address) ?? []).map((o) => ({
    type: "payment" as const,
    at: o.createdAt,
    usd: -Number(merchant?.formatAmount(o)),
    description: o.description,
    tx: o.tx,
  }));
  const refills =
    card.address === agentCard && scheduler
      ? scheduler
          .log(500)
          .filter((e) => e.action === "refill" && e.status === "executed")
          .map((e) => ({
            type: "refill" as const,
            at: e.at,
            usd: e.usd ?? 0,
            description: e.reason,
            tx: e.txs.at(-1) ?? null,
          }))
      : [];
  return c.json([...payments, ...refills].sort((a, b) => b.at - a.at));
});

// Strategy: saved one wins over the env default. Read by anyone (like /portfolio); only the
// card the agent serves may change it, because it decides what the agent trades.
const envStrategy = {
  targets: Object.fromEntries(
    Object.entries(JSON.parse(process.env.AGENT_TARGETS ?? "{}") as Record<string, number>).map(
      ([a, w]) => [a.toLowerCase(), w],
    ),
  ),
  weeklyEstimateUsd: Number(process.env.WEEKLY_ESTIMATE_USD ?? 0),
};
const strategy = strategies.load() ?? envStrategy;
const symbolOf = (address: string) =>
  market.all().find((m) => m.address === address)?.symbol ?? null;

app.get("/strategy", (c) =>
  c.json({
    ...strategy,
    tokens: Object.entries(strategy.targets).map(([address, weight]) => ({
      address,
      symbol: symbolOf(address),
      weight,
    })),
  }),
);

app.put("/strategy", async (c) => {
  const card = me(c);
  if (!card) return c.json(unauthorized, 401);
  if (card.address !== agentCard)
    return c.json({ error: "only the card this agent refills can change its strategy" }, 403);
  const parsed = parseStrategy(await c.req.json().catch(() => null), (k) => {
    const m = market.all().find((x) => x.symbol === k || x.address === k.toLowerCase());
    return m?.address;
  });
  if (typeof parsed === "string") return c.json({ error: parsed }, 400);
  strategies.save(parsed);
  // In place: the scheduler reads these on every tick.
  strategy.targets = parsed.targets;
  strategy.weeklyEstimateUsd = parsed.weeklyEstimateUsd;
  return c.json(parsed);
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
const mode = agentMode;
if (mode === "dry" || mode === "live") {
  const env = process.env;
  if (!agentCard) throw new Error("CARD_ADDRESS must be set");
  // Getters, so a strategy saved from the app takes effect on the next tick.
  const config: SchedulerConfig = {
    mode,
    card: agentCard,
    get targets() {
      return strategy.targets;
    },
    get weeklyEstimateUsd() {
      return strategy.weeklyEstimateUsd;
    },
    tzOffsetMinutes: Number(env.TZ_OFFSET_MIN ?? 420),
    cardCreatedAt:
      Date.parse(env.CARD_CREATED_AT ?? "") || cards.get(agentCard)?.createdAt || Date.now(),
  };
  const cardBalanceUsd = async () => (await balances(agentCard)).usd1;
  const s = createScheduler({
    db,
    config,
    agent,
    markets: market.all,
    cardBalanceUsd,
    spends: () => merchant?.spendsOf(config.card) ?? [],
  });

  scheduler = s;

  // Plan after the market has data; the scheduler guards its own overlap.
  setInterval(() => {
    if (market.lastPoll()) s.tick().catch((e) => console.error("scheduler tick failed:", e));
  }, POLL_MS);

  app.get("/agent/decisions", (c) => c.json(s.log(Number(c.req.query("limit") ?? 50))));
  app.get("/agent/session", async (c) => c.json(await agent.session()));

  // Portfolio screen: agent wallet holdings (with weights vs targets and market data) + card.
  // ponytail: every call runs baw (a few seconds); cache it if the UI polls often.
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
          target: strategy.targets[address] ?? 0,
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
    return c.json({ at, mode, decision: await s.preview(at) });
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
