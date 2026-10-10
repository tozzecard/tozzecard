"use client";
import { useState } from "react";
import { ApiError, api } from "../../lib/api";
import { usd } from "../../lib/format";
import { Button, Card } from "../ui";

interface Preview {
  at: number;
  mode: "dry" | "live";
  decision: {
    action: "none" | "refill" | "hold";
    reason: string;
    usd?: number;
    symbol?: string;
  };
}

/** The next weekday at hh:mm New York time (EDT, UTC-4, in October), as an ISO string. */
function nextNy(weekday: number, hour: number, minute: number): string {
  const d = new Date();
  const days = (weekday - d.getUTCDay() + 7) % 7 || 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, hour + 4, minute),
  ).toISOString();
}

const PRESETS = [
  { label: "Fri 3:30pm", at: () => nextNy(5, 15, 30) },
  { label: "Sat noon", at: () => nextNy(6, 12, 0) },
  { label: "Now", at: () => new Date().toISOString() },
];

const VERB = { refill: "Tops up your card", hold: "Waits", none: "Does nothing" };

/**
 * Demo time travel (plan §8 step 4): what the agent would decide at a chosen time, from
 * GET /agent/preview. It never trades; real refills happen only through the scheduler.
 */
export function PreviewCard() {
  const [result, setResult] = useState<Preview | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (p: (typeof PRESETS)[number]) => {
    setBusy(true);
    setError(null);
    setLabel(p.label);
    try {
      setResult(await api<Preview>(`/agent/preview?at=${encodeURIComponent(p.at())}`));
    } catch (e) {
      setResult(null);
      setError(
        e instanceof ApiError && e.status === 404
          ? "Needs the agent running."
          : e instanceof ApiError && (e.code === "SESSION_EXPIRED" || e.code === "NOT_LOGGED_IN")
            ? "Agent needs a sign-in in the Binance App."
            : e instanceof Error
              ? e.message
              : "Could not ask the agent.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="px-5 py-4">
      <div className="text-[14px] font-semibold">What would the agent do?</div>
      <p className="mt-0.5 text-[12.5px] text-muted">Pick a time in New York.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="md"
            variant={label === p.label ? "ink" : "glass"}
            onClick={() => void run(p)}
            disabled={busy}
            className="min-w-0 flex-1 whitespace-nowrap !px-2 text-[13px]"
          >
            {p.label}
          </Button>
        ))}
      </div>
      {result ? (
        <div className="mt-4 rounded-2xl bg-pill px-4 py-3">
          <div className="text-[14px] font-semibold">
            {VERB[result.decision.action]}
            {result.decision.symbol ? ` · ${result.decision.symbol}` : ""}
            {result.decision.usd ? ` · ${usd(result.decision.usd)}` : ""}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{result.decision.reason}</p>
          <p className="mt-1 text-[11px] text-muted">Preview. Nothing traded.</p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-[13px] text-muted">{error}</p> : null}
    </Card>
  );
}
