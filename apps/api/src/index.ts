// Backend: market-hours reader, spend forecaster, refill/rebalance scheduler, agent decision log.
// Owner: Kiel. See docs/plan.md §3.
import { Database } from "bun:sqlite";
import { clientFromEnv } from "@tozzecard/binance";
import { Hono } from "hono";
import { createMarket } from "./market";

const POLL_MS = Number(process.env.MARKET_POLL_MS ?? 60_000);

const market = createMarket(
  clientFromEnv(),
  new Database(process.env.DB_PATH ?? "tozzecard.sqlite"),
);

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

export default { port: Number(process.env.API_PORT ?? 8787), fetch: app.fetch };
