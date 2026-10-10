"use client";
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { useCard } from "../../hooks/useCard";
import { ApiError, api } from "../../lib/api";
import { StockLogo } from "../StockLogo";
import { Button, Card } from "../ui";
import { NumberSheet } from "./NumberSheet";

interface Strategy {
  targets: Record<string, number>;
  weeklyEstimateUsd: number;
  tokens: { address: string; symbol: string | null; weight: number }[];
}

interface Choice {
  symbol: string;
  ticker: string;
  name: string;
}

/**
 * Stocks the agent can hold, as /market symbols, by issuer. bStocks (Binance) swap straight to
 * USD1; Ondo goes through USDT first (research.md L3). Apple and Amazon have no bStock on BSC.
 */
const GROUPS: { title: string; hint: string; choices: Choice[] }[] = [
  {
    title: "bStocks · Binance",
    hint: "Straight to USD1",
    choices: [
      { symbol: "NVDAB", ticker: "NVDA", name: "NVIDIA" },
      { symbol: "MSFTB", ticker: "MSFT", name: "Microsoft" },
      { symbol: "GOOGLB", ticker: "GOOGL", name: "Alphabet" },
      { symbol: "METAB", ticker: "META", name: "Meta" },
      { symbol: "TSLAB", ticker: "TSLA", name: "Tesla" },
    ],
  },
  {
    title: "Ondo",
    hint: "Via USDT",
    choices: [
      { symbol: "NVDAon", ticker: "NVDA", name: "NVIDIA" },
      { symbol: "AAPLon", ticker: "AAPL", name: "Apple" },
      { symbol: "MSFTon", ticker: "MSFT", name: "Microsoft" },
      { symbol: "GOOGLon", ticker: "GOOGL", name: "Alphabet" },
      { symbol: "AMZNon", ticker: "AMZN", name: "Amazon" },
      { symbol: "METAon", ticker: "META", name: "Meta" },
      { symbol: "TSLAon", ticker: "TSLA", name: "Tesla" },
    ],
  },
];

const CHOICES = GROUPS.flatMap((g) => g.choices);

/**
 * The Targets tab: which stocks and in what split, and roughly what you spend a week
 * (plan §3.1 step 4). PUT /strategy; only the card the agent refills may change it (403 otherwise).
 */
export function Targets() {
  const { session } = useCard();
  const current = useApi<Strategy>("/strategy", 600_000);
  // Whole percentages per symbol; 0 means not held.
  const [pcts, setPcts] = useState<Record<string, number>>({});
  const [weekly, setWeekly] = useState("80");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Which figure the keypad sheet is editing: a symbol, or the weekly spend.
  const [editing, setEditing] = useState<string | null>(null);

  // Start from the saved strategy, once.
  useEffect(() => {
    if (!current.data || Object.keys(pcts).length) return;
    const next: Record<string, number> = {};
    for (const t of current.data.tokens) {
      const c = CHOICES.find((x) => x.symbol === t.symbol);
      if (c) next[c.symbol] = Math.round(t.weight * 100);
    }
    setPcts(Object.keys(next).length ? next : { NVDAB: 70, MSFTB: 30 });
    if (current.data.weeklyEstimateUsd) setWeekly(String(current.data.weeklyEstimateUsd));
  }, [current.data, pcts]);

  const total = Object.values(pcts).reduce((a, b) => a + b, 0);
  /** What one stock may take: 100% less everything the others already hold. */
  const room = (p: Record<string, number>, symbol: string) =>
    100 - Object.entries(p).reduce((a, [k, v]) => (k === symbol ? a : a + v), 0);
  /**
   * +/- moves in fives, landing on the next multiple of 5 from a typed value like 33. A step up
   * never takes the total past 100%.
   */
  const step = (symbol: string, dir: 1 | -1) =>
    setPcts((p) => {
      const v = p[symbol] ?? 0;
      const next = dir > 0 ? Math.floor(v / 5) * 5 + 5 : Math.ceil(v / 5) * 5 - 5;
      return { ...p, [symbol]: Math.max(0, Math.min(room(p, symbol), next)) };
    });
  const setPct = (symbol: string, v: number) =>
    setPcts((p) => ({ ...p, [symbol]: Math.max(0, Math.min(room(p, symbol), Math.round(v))) }));
  const editingChoice = CHOICES.find((c) => c.symbol === editing);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const targets = Object.fromEntries(
        Object.entries(pcts)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => [k, v / 100]),
      );
      await api("/strategy", {
        method: "PUT",
        token: session?.token,
        body: { targets, weeklyEstimateUsd: Number(weekly) },
      });
      setSaved(true);
      void current.reload();
      window.setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? "Only the card your agent tops up can change this."
          : e instanceof Error
            ? e.message
            : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* The running total, so a split that doesn't add up is visible before Save refuses it. */}
      <div
        className={`mb-5 rounded-[16px] border px-4 py-3 ${
          total > 100 ? "border-neg/30 bg-[#fbecea]" : "border-line bg-white"
        }`}
      >
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold">Allocated</span>
          <span
            className={`font-semibold tabular-nums ${
              total > 100 ? "text-neg" : total === 100 ? "text-pos" : "text-ink-2"
            }`}
          >
            {total}% / 100%
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pill">
          <div
            className={`h-full rounded-full transition-all ${
              total > 100 ? "bg-neg" : total === 100 ? "bg-pos" : "bg-ink"
            }`}
            style={{ width: `${Math.min(100, total)}%` }}
          />
        </div>
        {total > 100 ? (
          <p className="mt-2 text-[12px] font-medium text-neg">
            Over by {total - 100}%. Lower a stock to get back to 100%.
          </p>
        ) : total < 100 ? (
          <p className="mt-2 text-[12px] text-muted">{100 - total}% left to place.</p>
        ) : null}
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="mb-6">
          <div className="mx-1 mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-ink-2">{g.title}</h2>
            <span className="text-[12px] text-muted">{g.hint}</span>
          </div>
          <Card className="divide-y divide-line px-4">
            {g.choices.map((c) => {
              const v = pcts[c.symbol] ?? 0;
              return (
                <div key={c.symbol} className="flex items-center gap-3 py-3">
                  <StockLogo ticker={c.ticker} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{c.name}</div>
                    <div className="text-[12px] text-muted">{c.symbol}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Less ${c.symbol}`}
                    onClick={() => step(c.symbol, -1)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-pill text-lg font-semibold"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`Type a share for ${c.symbol}`}
                    onClick={() => setEditing(c.symbol)}
                    className="h-9 w-14 rounded-xl bg-[#E9E9E9] text-center text-[15px] font-semibold tabular-nums transition-colors hover:bg-[#E0E0E0] active:bg-[#D6D6D6]"
                  >
                    {v}%
                  </button>
                  <button
                    type="button"
                    aria-label={`More ${c.symbol}`}
                    onClick={() => step(c.symbol, 1)}
                    disabled={total >= 100}
                    className="grid h-9 w-9 place-items-center rounded-full bg-pill text-lg font-semibold disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </Card>
        </section>
      ))}
      <Card className="flex items-center gap-3 px-4 py-3">
        <label htmlFor="weekly" className="min-w-0 flex-1 text-[14px] font-semibold">
          Weekly spend
        </label>
        <span className="text-[14px] text-muted">$</span>
        <button
          id="weekly"
          type="button"
          onClick={() => setEditing("weekly")}
          className="h-9 min-w-20 rounded-xl bg-[#E9E9E9] px-3 text-right text-[15px] font-semibold tabular-nums transition-colors hover:bg-[#E0E0E0] active:bg-[#D6D6D6]"
        >
          {weekly}
        </button>
      </Card>

      <div className="mt-5">
        {error ? <p className="mb-2 text-center text-[13px] text-neg">{error}</p> : null}
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || total !== 100 || !(Number(weekly) > 0)}
        >
          {saved
            ? "Saved"
            : busy
              ? "Saving…"
              : total === 100
                ? "Save"
                : `Total ${total}%, needs 100%`}
        </Button>
      </div>
      <NumberSheet
        open={editing !== null}
        title={
          editing === "weekly"
            ? "Weekly spend"
            : editingChoice
              ? `${editingChoice.name} · ${editingChoice.symbol}`
              : ""
        }
        value={editing === "weekly" ? Number(weekly) || 0 : (pcts[editing ?? ""] ?? 0)}
        symbol={editing === "weekly" ? "$" : ""}
        suffix={editing === "weekly" ? "" : "%"}
        decimals={editing === "weekly"}
        max={editing === "weekly" ? undefined : room(pcts, editing ?? "")}
        onClose={() => setEditing(null)}
        onSet={(n) => {
          if (editing === "weekly") setWeekly(String(n));
          else if (editing) setPct(editing, n);
        }}
      />
    </div>
  );
}
