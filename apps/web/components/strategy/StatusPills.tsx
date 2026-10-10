"use client";
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { AgentSession, Market } from "../../lib/api";
import { until } from "../../lib/format";

function Pill({ on, label, sub }: { on: boolean; label: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-pos" : "bg-faint"}`} />
      <span className="truncate text-[13px] font-semibold">{label}</span>
      {sub ? (
        <span className="ml-auto shrink-0 text-[12px] text-muted tabular-nums">{sub}</span>
      ) : null}
    </div>
  );
}

/** Two facts at a glance: is New York open (SPYon is the clock), and is the agent connected. */
export function StatusPills() {
  const market = useApi<Market>("/market/SPYon", 60_000);
  const session = useApi<AgentSession>("/agent/session", 60_000);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const open = market.data?.status.marketStatus === "regular";
  const next = open ? market.data?.status.nextCloseTime : market.data?.status.nextOpenTime;
  const agentOn = Boolean(session.data?.connected && !session.data.devMode);

  return (
    <div className="flex gap-2">
      <Pill
        on={open}
        label={open ? "Market open" : "Market closed"}
        sub={next && now ? `${open ? "closes" : "opens"} ${until(next, now)}` : undefined}
      />
      <Pill
        on={agentOn}
        label={session.off ? "Agent off" : agentOn ? "Agent on" : "Agent signed out"}
      />
    </div>
  );
}
