// Backend: market-hours reader, spend forecaster, refill/rebalance scheduler, agent decision log.
// Owner: Kiel. See docs/plan.md §3.
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

export default { port: Number(process.env.API_PORT ?? 8787), fetch: app.fetch };
