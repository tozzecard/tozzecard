// Refill scheduler: every tick, plan (refill.ts) and, in live mode, execute through the agent.
// Safety first, this moves real money:
//   - mode "dry" logs decisions and never trades; "live" must be switched on explicitly
//   - a swap that times out while PENDING is "unknown": no new trade until someone checks it
//   - a cooldown after each executed refill, and one tick at a time
//   - a signed-out Agentic Wallet is "blocked", not retried
import type { Database } from "bun:sqlite";
import type { Holding, SwapResult } from "@tozzecard/agent";
import { forecast, type Spend } from "./forecast";
import type { MarketView } from "./market";
import { type Decision, type Position, planRefill } from "./refill";

const COOLDOWN_MS = 5 * 60_000;
const UNKNOWN_BLOCKS_MS = 30 * 60_000;
// Statuses the market service reports for tokens we must not sell.
const UNSELLABLE = new Set(["UNSUPPORTED", "ASSET_PAUSED", "ASSET_LIMITED", "MARKET_PAUSED"]);

export interface AgentPort {
  holdings(): Promise<Holding[]>;
  sellForCard(token: string, amount: string): Promise<SwapResult[]>;
  refill(cardAddress: string, usd1: string): Promise<string>;
}

export interface SchedulerConfig {
  mode: "dry" | "live";
  card: string;
  /** token address → target weight */
  targets: Record<string, number>;
  weeklyEstimateUsd: number;
  tzOffsetMinutes: number;
  cardCreatedAt: number;
}

export type Status = "logged" | "dry-run" | "executed" | "failed" | "unknown" | "blocked";

export interface LogEntry {
  id: number;
  at: number;
  action: Decision["action"];
  symbol: string | null;
  usd: number | null;
  reason: string;
  status: Status;
  txs: string[];
  error: string | null;
}

export function createScheduler(deps: {
  db: Database;
  config: SchedulerConfig;
  agent: AgentPort;
  markets: () => MarketView[];
  cardBalanceUsd: () => Promise<number>;
  spends: () => Spend[];
}) {
  const { db, config, agent } = deps;
  db.run(`CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL,
    symbol TEXT, usd REAL, reason TEXT NOT NULL, status TEXT NOT NULL,
    txs TEXT NOT NULL DEFAULT '[]', error TEXT)`);
  const insert = db.prepare(
    "INSERT INTO decisions (at, action, symbol, usd, reason, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  );
  const finish = db.prepare("UPDATE decisions SET status = ?, txs = ?, error = ? WHERE id = ?");
  const rows = db.prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?");
  const lastWith = db.prepare<{ at: number }, [string]>(
    "SELECT at FROM decisions WHERE status = ? ORDER BY id DESC LIMIT 1",
  );
  const last = db.prepare<{ action: string; symbol: string | null }, []>(
    "SELECT action, symbol FROM decisions ORDER BY id DESC LIMIT 1",
  );

  const log = (limit = 50): LogEntry[] =>
    (rows.all(limit) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as LogEntry),
      txs: JSON.parse(String(r.txs)),
    }));

  async function positions(): Promise<{ positions: Position[]; prices: Map<string, number> }> {
    const byAddress = new Map(deps.markets().map((m) => [m.address.toLowerCase(), m]));
    const targets = new Map(
      Object.entries(config.targets).map(([a, w]) => [a.toLowerCase(), w] as const),
    );
    const prices = new Map<string, number>();
    const out: Position[] = [];
    for (const h of await agent.holdings()) {
      const address = h.address.toLowerCase();
      const m = byAddress.get(address);
      if (!m) continue; // not a tokenized stock (USDT, USD1, BNB)
      prices.set(address, m.tokenPrice);
      out.push({
        symbol: m.symbol,
        address,
        valueUsd: Number(h.value),
        target: targets.get(address) ?? 0,
        spread: m.spreadVsClose,
        sellable: !UNSELLABLE.has(m.status.reasonCode ?? ""),
      });
    }
    return { positions: out, prices };
  }

  async function plan(now: number) {
    const [{ positions: p, prices }, cardUsd] = await Promise.all([
      positions(),
      deps.cardBalanceUsd(),
    ]);
    const f = forecast(
      {
        spends: deps.spends(),
        weeklyEstimateUsd: config.weeklyEstimateUsd,
        cardCreatedAt: config.cardCreatedAt,
        tzOffsetMinutes: config.tzOffsetMinutes,
      },
      now,
    );
    return { decision: planRefill({ now, cardUsd, forecast: f, positions: p }), prices };
  }

  let running = false;
  async function tick(now = Date.now()): Promise<LogEntry | null> {
    if (running) return null;
    running = true;
    try {
      const unknown = lastWith.get("unknown");
      if (unknown && now - unknown.at < UNKNOWN_BLOCKS_MS) return null;
      const done = lastWith.get("executed");
      if (done && now - done.at < COOLDOWN_MS) return null;

      const { decision: d, prices } = await plan(now);
      const symbol = "symbol" in d ? (d.symbol ?? null) : null;
      if (d.action !== "refill") {
        // Log a no-op only when it changes, not every minute.
        const prev = last.get();
        if (prev?.action === d.action && prev.symbol === symbol) return null;
        const { id } = insert.get(now, d.action, symbol, null, d.reason, "logged") as {
          id: number;
        };
        return log(1).find((e) => e.id === id) ?? null;
      }

      const { id } = insert.get(now, d.action, d.symbol, d.usd, d.reason, config.mode) as {
        id: number;
      };
      if (config.mode === "dry") {
        finish.run("dry-run", "[]", null, id);
        return log(1)[0];
      }

      const txs: string[] = [];
      try {
        const price = prices.get(d.address) ?? 0;
        if (!(price > 0)) throw new Error(`no price for ${d.symbol}`);
        const qty = (Math.floor((d.usd / price) * 1e8) / 1e8).toFixed(8);
        const legs = await agent.sellForCard(d.address, qty);
        for (const l of legs) if (l.order.txHash) txs.push(l.order.txHash);
        const usd1 = legs.at(-1)?.order.toTokenActualQty;
        if (!usd1) throw new Error("sold, but the USD1 amount is unknown; not sending");
        txs.push(await agent.refill(config.card, usd1));
        finish.run("executed", JSON.stringify(txs), null, id);
      } catch (e) {
        const err = e as Error & { name?: string };
        const status: Status =
          err.name === "SESSION_EXPIRED"
            ? "blocked"
            : /still PENDING/.test(err.message)
              ? "unknown"
              : "failed";
        finish.run(status, JSON.stringify(txs), err.message, id);
      }
      return log(1)[0];
    } finally {
      running = false;
    }
  }

  /** What the agent would decide at `at` (time travel for the demo). Never trades, never logs. */
  const preview = async (at: number) => (await plan(at)).decision;

  return { tick, preview, log };
}

export type Scheduler = ReturnType<typeof createScheduler>;
