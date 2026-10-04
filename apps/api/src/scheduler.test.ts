import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { Holding, Quote, SwapResult } from "@tozzecard/agent";
import type { MarketView } from "./market";
import { type AgentPort, createScheduler, type SchedulerConfig } from "./scheduler";

const utc = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h, mi);
const FRI_1540 = utc(10, 2, 19, 40); // 15:40 NY, 20 min before the close
const SAT = utc(10, 3, 15);
const NVDA = "0xnvda";
const TSLA = "0xtsla";

const view = (symbol: string, address: string, tokenPrice: number, spread = 0.002) =>
  ({
    symbol,
    address,
    tokenPrice,
    ratio: 1,
    closeRef: { perShare: tokenPrice, at: 0 },
    spreadVsClose: spread,
    status: { reasonCode: "TRADING" },
  }) as unknown as MarketView;
const holding = (address: string, value: number) =>
  ({ address, value: String(value) }) as unknown as Holding;
const swapped = (tx: string, out?: string) =>
  ({ order: { txHash: tx, toTokenActualQty: out } }) as unknown as SwapResult;

function setup(opts: {
  mode?: "dry" | "live";
  card?: number;
  agent?: Partial<AgentPort>;
  spread?: number;
  /** Executable quote vs the close, e.g. -0.03 = sale fetches 3% less. */
  quoted?: number;
  targets?: Record<string, number>;
}) {
  const calls: string[] = [];
  const agent: AgentPort = {
    holdings: async () => [holding(NVDA, 70), holding(TSLA, 30), holding("0xusdt", 3)],
    quote: async (from, _to, qty) => {
      calls.push(`quote ${from}`);
      const price = from === NVDA ? 230 : 400;
      return { toCoinAmount: String(Number(qty) * price * (1 + (opts.quoted ?? 0))) } as Quote;
    },
    sellForCard: async (t, q) => {
      calls.push(`sell ${t} ${q}`);
      return [swapped("0xsell", "59.80")];
    },
    refill: async (card, usd1) => {
      calls.push(`refill ${card} ${usd1}`);
      return "0xrefill";
    },
    rebalance: async () => {
      calls.push("rebalance");
      return [{ swap: swapped("0xreb1") }, { swap: swapped("0xreb2") }];
    },
    ...opts.agent,
  };
  const config: SchedulerConfig = {
    mode: opts.mode ?? "live",
    card: "0xcard",
    targets: opts.targets ?? { [NVDA]: 0.5, [TSLA]: 0.5 },
    weeklyEstimateUsd: 7 * 24, // $1/hour
    tzOffsetMinutes: 420,
    cardCreatedAt: FRI_1540, // new card: forecast = onboarding estimate
  };
  const s = createScheduler({
    db: new Database(":memory:"),
    config,
    agent,
    markets: () => [view("NVDAon", NVDA, 230, opts.spread), view("TSLAB", TSLA, 400, opts.spread)],
    cardBalanceUsd: async () => opts.card ?? 20,
    spends: () => [],
  });
  return { s, calls };
}

test("live: Friday before the close it sells the overweight stock and sends the USD1 to the card", async () => {
  const { s, calls } = setup({});
  const e = await s.tick(FRI_1540);
  expect(e).toMatchObject({ action: "refill", symbol: "NVDAon", status: "executed" });
  expect(e?.txs).toEqual(["0xsell", "0xrefill"]);
  // qty in token units at $230, rounded down; the card gets what the sale actually returned
  expect(calls[0]).toMatch(/^sell 0xnvda 0\.\d{8}$/);
  expect(calls[1]).toBe("refill 0xcard 59.80");
});

test("dry: logs the refill it would do and never touches the agent", async () => {
  const { s, calls } = setup({ mode: "dry" });
  expect(await s.tick(FRI_1540)).toMatchObject({ action: "refill", status: "dry-run" });
  expect(calls).toEqual([]);
});

test("a signed-out wallet is blocked, nothing sent", async () => {
  const { s, calls } = setup({
    agent: {
      sellForCard: async () => {
        throw Object.assign(new Error("signed out"), { name: "SESSION_EXPIRED" });
      },
    },
  });
  expect(await s.tick(FRI_1540)).toMatchObject({ status: "blocked", error: "signed out" });
  expect(calls).toEqual([]);
});

test("a swap stuck in PENDING is unknown and stops further trades for 30 min", async () => {
  let sells = 0;
  const { s } = setup({
    agent: {
      sellForCard: async () => {
        sells++;
        throw new Error("swap 7 still PENDING after 90000ms");
      },
    },
  });
  expect(await s.tick(FRI_1540)).toMatchObject({ status: "unknown" });
  expect(await s.tick(FRI_1540 + 60_000)).toBeNull();
  expect(sells).toBe(1);
});

test("sold but no USD1 amount: nothing is sent, the sell tx is kept", async () => {
  const { s, calls } = setup({ agent: { sellForCard: async () => [swapped("0xsell")] } });
  const e = await s.tick(FRI_1540);
  expect(e).toMatchObject({ status: "failed", txs: ["0xsell"] });
  expect(calls).toEqual([]);
});

test("cooldown after an executed refill", async () => {
  const { s, calls } = setup({});
  await s.tick(FRI_1540);
  expect(await s.tick(FRI_1540 + 60_000)).toBeNull();
  expect(calls).toHaveLength(2);
});

test("repeated no-ops are logged once", async () => {
  const { s } = setup({ card: 500, targets: { [NVDA]: 0.7, [TSLA]: 0.3 } });
  expect(await s.tick(FRI_1540)).toMatchObject({ action: "none", status: "logged" });
  expect(await s.tick(FRI_1540 + 60_000)).toBeNull();
  expect(s.log()).toHaveLength(1);
});

test("weekend with a wide spread holds instead of selling", async () => {
  const { s, calls } = setup({ card: 3, spread: -0.04 });
  expect(await s.tick(SAT)).toMatchObject({ action: "hold", status: "logged" });
  expect(calls).toEqual([]);
});

test("weekend: on-chain price pinned to the close, but the executable quote is 3% worse: hold (#31)", async () => {
  const { s, calls } = setup({ card: 3, spread: 0.0001, quoted: -0.03 });
  const e = await s.tick(SAT);
  expect(e).toMatchObject({ action: "hold", status: "logged" });
  expect(e?.reason).toContain("-3.0% vs Friday's close");
  expect(calls).toEqual(["quote 0xnvda"]);
});

test("weekend: executable quote close to the close: sells the minimum", async () => {
  const { s, calls } = setup({ card: 3, spread: 0.0001, quoted: -0.002 });
  expect(await s.tick(SAT)).toMatchObject({ action: "refill", status: "executed" });
  expect(calls[0]).toBe("quote 0xnvda");
  expect(calls[1]).toMatch(/^sell 0xnvda /);
});

test("weekend: no quote, no sale", async () => {
  const { s, calls } = setup({
    card: 3,
    spread: 0.0001,
    agent: {
      quote: async () => {
        throw new Error("TIMEOUT");
      },
    },
  });
  expect(await s.tick(SAT)).toMatchObject({ action: "hold", status: "logged" });
  expect(calls).toEqual([]);
});

test("preview time-travels without trading or logging", async () => {
  const { s, calls } = setup({});
  expect((await s.preview(FRI_1540)).action).toBe("refill");
  expect((await s.preview(SAT)).action).toBe("none");
  expect(calls).toEqual([]);
  expect(s.log()).toEqual([]);
});

// Holdings are NVDA $70 / TSLA $30 (+ a token outside the targets) against 50/50 targets.
test("rebalance (dry): open market, no refill due, drift over 5%: logs the trades once a day", async () => {
  const { s, calls } = setup({ mode: "dry", card: 500 });
  const e = await s.tick(FRI_1540);
  expect(e).toMatchObject({ action: "rebalance", status: "dry-run" });
  expect(e?.reason).toBe(
    "TSLAB is 30% of the portfolio vs a 50% target: selling $20.00 NVDAon, buying $20.00 TSLAB.",
  );
  expect((await s.tick(FRI_1540 + 60_000))?.action).toBe("none");
  expect(calls).toEqual([]);
});

test("rebalance (live): runs the agent and keeps the tx hashes", async () => {
  const { s, calls } = setup({ card: 500 });
  expect(await s.tick(FRI_1540)).toMatchObject({
    action: "rebalance",
    status: "executed",
    txs: ["0xreb1", "0xreb2"],
  });
  expect(calls).toEqual(["rebalance"]);
});

test("rebalance: a failed leg keeps the done swaps and is not retried the same day", async () => {
  let runs = 0;
  const { s } = setup({
    card: 500,
    agent: {
      rebalance: async () => {
        runs++;
        throw Object.assign(new Error("swap 9 FAILED"), { results: [{ swap: swapped("0xsold") }] });
      },
    },
  });
  expect(await s.tick(FRI_1540)).toMatchObject({ status: "failed", txs: ["0xsold"] });
  await s.tick(FRI_1540 + 10 * 60_000);
  expect(runs).toBe(1);
});

test("rebalance waits for the market: none on a Saturday", async () => {
  const { s, calls } = setup({ card: 500 });
  expect((await s.tick(SAT))?.action).toBe("none");
  expect(calls).toEqual([]);
});

test("a due refill wins over the rebalance", async () => {
  const { s, calls } = setup({});
  expect((await s.tick(FRI_1540))?.action).toBe("refill");
  expect(calls).not.toContain("rebalance");
});
