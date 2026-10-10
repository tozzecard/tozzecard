"use client";
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { type AgentSession, bscscanTx, type Decision } from "../../lib/api";
import { ago, usd } from "../../lib/format";
import { PreviewCard } from "../agent/PreviewCard";
import { Card, Section, Skeleton } from "../ui";

const ACTION: Record<Decision["action"], string> = {
  refill: "Topped up your card",
  rebalance: "Rebalanced",
  hold: "Waited",
  none: "Checked",
};

const STATUS: Partial<Record<Decision["status"], string>> = {
  "dry-run": "planned",
  failed: "failed",
  blocked: "blocked",
  unknown: "unconfirmed",
};

function SessionCard() {
  const { data, off, loading } = useApi<AgentSession>("/agent/session", 60_000);
  if (loading) return <Skeleton className="h-[72px] w-full rounded-[20px]" />;
  const ok = data?.connected && !data.devMode;
  return (
    <Card className="flex items-center gap-3 px-5 py-4">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-pos" : "bg-faint"}`} />
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="text-[14px] font-semibold">
          {off
            ? "Agent not running"
            : !data?.connected
              ? "Sign in to your Agentic Wallet"
              : data.devMode
                ? "Turn off Developer Mode"
                : "Agent connected"}
        </div>
        <div className="text-muted">
          {off
            ? "Its decisions will show up here once it runs."
            : data?.devMode
              ? "With Developer Mode on, the address book can be bypassed, so the agent refuses to run."
              : data?.connected
                ? `${usd(data.quotaLeft)} left of today's limit, set by you in the Binance App.`
                : "Confirm the sign-in in the Binance App."}
        </div>
      </div>
    </Card>
  );
}

/** The agent's session, time travel, and every decision with its reason and tx (plan §3.6). */
export function AgentFeed() {
  const feed = useApi<Decision[]>("/agent/decisions?limit=50", 30_000);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = (feed.data ?? []).filter((d) => d.action !== "none");

  return (
    <div>
      <div className="mb-5">
        <SessionCard />
      </div>

      <Section title="Time travel">
        <PreviewCard />
      </Section>

      <Section title="Decisions">
        {feed.loading ? (
          <Skeleton className="h-40 w-full rounded-[20px]" />
        ) : rows.length === 0 ? (
          <Card className="px-5 py-6 text-center text-[13px] text-muted">
            {feed.off ? "The agent isn't running yet." : "Nothing to do so far."}
          </Card>
        ) : (
          <Card className="divide-y divide-line px-5">
            {rows.map((d) => (
              <div key={d.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold">
                    {ACTION[d.action]}
                    {d.symbol ? ` · ${d.symbol}` : ""}
                    {d.usd ? ` · ${usd(d.usd)}` : ""}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {now ? ago(d.at, now) : ""}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">{d.reason}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                  {STATUS[d.status] ? (
                    <span className={d.status === "failed" ? "text-neg" : "text-muted"}>
                      {STATUS[d.status]}
                    </span>
                  ) : null}
                  {d.txs.map((tx) => (
                    <a
                      key={tx}
                      href={bscscanTx(tx)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink underline underline-offset-2"
                    >
                      View on BscScan
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}
