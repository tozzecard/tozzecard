"use client";
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { useCard } from "../../hooks/useCard";
import { ApiError, api } from "../../lib/api";
import { StockLogo } from "../StockLogo";
import { Button, Card } from "../ui";

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
  const step = (symbol: string, by: number) =>
    setPcts((p) => ({ ...p, [symbol]: Math.max(0, Math.min(100, (p[symbol] ?? 0) + by)) }));

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
                    onClick={() => step(c.symbol, -10)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-pill text-lg font-semibold"
                  >
                    −
                  </button>
                  <span className="w-11 text-center text-[15px] font-semibold tabular-nums">
                    {v}%
                  </span>
                  <button
                    type="button"
                    aria-label={`More ${c.symbol}`}
                    onClick={() => step(c.symbol, 10)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-pill text-lg font-semibold"
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
        <input
          id="weekly"
          inputMode="decimal"
          value={weekly}
          onChange={(e) => setWeekly(e.target.value.replace(/[^0-9.]/g, ""))}
          className="h-9 w-20 rounded-xl bg-pill px-3 text-right text-[15px] font-semibold tabular-nums outline-none focus:bg-white focus:ring-1 focus:ring-ink"
        />
      </Card>

      {/* Sticks above the bottom bar so Save is always in reach on a long list. */}
      <div className="sticky bottom-[100px] z-30 mt-5 lg:bottom-6">
        {error ? (
          <p className="mb-2 rounded-xl bg-white/90 px-3 py-2 text-center text-[13px] text-neg">
            {error}
          </p>
        ) : null}
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
    </div>
  );
}
