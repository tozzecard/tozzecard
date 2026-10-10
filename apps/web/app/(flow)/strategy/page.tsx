"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StockLogo } from "../../../components/StockLogo";
import { Button, Card } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import { ApiError, api } from "../../../lib/api";

interface Strategy {
  targets: Record<string, number>;
  weeklyEstimateUsd: number;
  tokens: { address: string; symbol: string | null; weight: number }[];
}

/** Stocks the agent can hold, as /market symbols (Ondo). */
const CHOICES = [
  { symbol: "NVDAon", ticker: "NVDA", name: "NVIDIA" },
  { symbol: "AAPLon", ticker: "AAPL", name: "Apple" },
  { symbol: "MSFTon", ticker: "MSFT", name: "Microsoft" },
  { symbol: "GOOGLon", ticker: "GOOGL", name: "Alphabet" },
  { symbol: "AMZNon", ticker: "AMZN", name: "Amazon" },
  { symbol: "METAon", ticker: "META", name: "Meta" },
  { symbol: "TSLAon", ticker: "TSLA", name: "Tesla" },
];

/**
 * Onboarding step 4 (plan §3.1): which stocks and in what split, and roughly what you spend a
 * week. PUT /strategy; only the card the server's agent refills may change it (403 otherwise).
 */
export default function StrategyPage() {
  const router = useRouter();
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
    setPcts(Object.keys(next).length ? next : { NVDAon: 70, AAPLon: 30 });
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
      window.setTimeout(() => router.push("/portfolio"), 700);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? "Only the card your agent tops up can set its targets. Add this card to your Agentic Wallet address book first."
          : e instanceof Error
            ? e.message
            : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={() => router.back()}
        className="self-start text-sm font-medium text-muted"
      >
        ← Back
      </button>
      <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.03em]">Your stocks</h1>
      <p className="mt-1 text-[14px] text-muted">
        Pick the split. The agent buys it, and sells what grows past it to fill your card.
      </p>

      <Card className="mt-6 divide-y divide-line px-4">
        {CHOICES.map((c) => {
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
                aria-label={`Less ${c.name}`}
                onClick={() => step(c.symbol, -10)}
                className="grid h-9 w-9 place-items-center rounded-full bg-pill text-lg font-semibold"
              >
                −
              </button>
              <span className="w-11 text-center text-[15px] font-semibold tabular-nums">{v}%</span>
              <button
                type="button"
                aria-label={`More ${c.name}`}
                onClick={() => step(c.symbol, 10)}
                className="grid h-9 w-9 place-items-center rounded-full bg-pill text-lg font-semibold"
              >
                +
              </button>
            </div>
          );
        })}
      </Card>
      <p className={`mx-1 mt-2 text-[12px] ${total === 100 ? "text-muted" : "text-neg"}`}>
        {total === 100 ? "Adds up to 100%." : `Adds up to ${total}%. It needs to be 100%.`}
      </p>

      <label htmlFor="weekly" className="mt-6 text-[13px] font-medium text-muted">
        Roughly what you spend a week (USD)
      </label>
      <input
        id="weekly"
        inputMode="decimal"
        value={weekly}
        onChange={(e) => setWeekly(e.target.value.replace(/[^0-9.]/g, ""))}
        className="mt-2 h-14 rounded-2xl border border-line bg-white px-4 text-xl font-semibold tabular-nums outline-none focus:border-ink"
      />
      <p className="mx-1 mt-2 text-[12px] text-muted">
        A starting guess. The agent learns from what you actually spend.
      </p>

      <div className="mt-auto pt-8">
        {error ? <p className="mb-3 text-center text-[13px] text-neg">{error}</p> : null}
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || total !== 100 || !(Number(weekly) > 0)}
        >
          {saved ? "Saved" : busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
