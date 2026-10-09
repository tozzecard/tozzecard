// The agent's strategy (plan §3.1 step 4): target weights per stock token and the weekly spend
// estimate the forecaster starts from. Saved from the app; the env values are only the default.
import type { Database } from "bun:sqlite";

export interface Strategy {
  /** token address (lowercase) → weight, summing to 1 */
  targets: Record<string, number>;
  weeklyEstimateUsd: number;
}

/**
 * Validate what the app sends. `targets` may name tokens by symbol (NVDAon) or address;
 * `resolve` maps either to a known token address. Returns the error message when invalid.
 */
export function parseStrategy(
  input: unknown,
  resolve: (symbolOrAddress: string) => string | undefined,
): Strategy | string {
  const { targets, weeklyEstimateUsd } = (input ?? {}) as Record<string, unknown>;
  if (!targets || typeof targets !== "object") return "targets must be an object";
  const entries = Object.entries(targets as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 10) return "pick 1 to 10 tokens";
  const out: Record<string, number> = {};
  for (const [k, w] of entries) {
    const address = resolve(k);
    if (!address) return `unknown token ${k}`;
    if (typeof w !== "number" || !(w > 0 && w <= 1)) return `weight of ${k} must be in (0, 1]`;
    out[address] = (out[address] ?? 0) + w;
  }
  const sum = Object.values(out).reduce((s, w) => s + w, 0);
  if (Math.abs(sum - 1) > 0.001) return `weights must add up to 1 (got ${sum.toFixed(3)})`;
  const weekly = Number(weeklyEstimateUsd);
  if (!Number.isFinite(weekly) || weekly < 0 || weekly > 100_000)
    return "weeklyEstimateUsd must be between 0 and 100000";
  return { targets: out, weeklyEstimateUsd: weekly };
}

export function createStrategyStore(db: Database) {
  db.run(
    "CREATE TABLE IF NOT EXISTS strategy (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
  );
  return {
    load: (): Strategy | null => {
      const r = db.query<{ json: string }, []>("SELECT json FROM strategy WHERE id = 1").get();
      return r ? JSON.parse(r.json) : null;
    },
    save: (s: Strategy) =>
      db.run("INSERT INTO strategy VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET json = ?1", [
        JSON.stringify(s),
      ]),
  };
}
