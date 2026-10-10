"use client";
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { bscscanTx, type Decision } from "../../lib/api";
import { ago, usd } from "../../lib/format";
import { Card, Skeleton } from "../ui";

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

/** Every decision with its reason, as the API writes it, and the tx behind it (plan §3.6). */
export function AgentFeed() {
  const feed = useApi<Decision[]>("/agent/decisions?limit=50", 30_000);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = (feed.data ?? []).filter((d) => d.action !== "none");

  if (feed.loading && !feed.data) return <Skeleton className="h-28 w-full rounded-[20px]" />;
  if (rows.length === 0)
    return (
      <Card className="px-5 py-8 text-center text-[13px] text-muted">
        {feed.off ? "The agent isn't running." : "Nothing yet."}
      </Card>
    );

  return (
    <Card className="divide-y divide-line px-5">
      {rows.map((d) => (
        <div key={d.id} className="py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold">
              {ACTION[d.action]}
              {d.symbol ? ` · ${d.symbol}` : ""}
              {d.usd ? ` · ${usd(d.usd)}` : ""}
            </span>
            <span className="shrink-0 text-[12px] text-muted">{now ? ago(d.at, now) : ""}</span>
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{d.reason}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px]">
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
                BscScan
              </a>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
