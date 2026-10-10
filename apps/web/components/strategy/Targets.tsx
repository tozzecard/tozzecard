"use client";
import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { Market } from "../../lib/api";
import { pct, until, usd } from "../../lib/format";
import { StockLogo } from "../StockLogo";
import { Card, Section, Skeleton } from "../ui";

interface Strategy {
  targets: Record<string, number>;
  weeklyEstimateUsd: number;
  tokens: { address: string; symbol: string | null; weight: number }[];
}

/** SPYon is the market clock (apps/api): bStocks carry no hours of their own. */
function MarketClock() {
  const { data } = useApi<Market>("/market/SPYon", 60_000);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!data || now === null) return <Skeleton className="h-[76px] w-full rounded-[20px]" />;
  const open = data.status.marketStatus === "regular";
  const next = open ? data.status.nextCloseTime : data.status.nextOpenTime;
  return (
    <Card className="flex items-center gap-4 px-5 py-4">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${open ? "bg-pos" : "bg-faint"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">
          {open ? "New York market is open" : "New York market is closed"}
        </div>
        <div className="text-[13px] text-muted">
          {open
            ? "Your agent can top up your card now."
            : "Your agent waits, unless your card runs low and the price is within 1% of the close."}
        </div>
      </div>
      {next ? (
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            {open ? "Closes in" : "Opens in"}
          </div>
          <div className="text-[15px] font-semibold tabular-nums">{until(next, now)}</div>
        </div>
      ) : null}
    </Card>
  );
}

/** The market clock the agent trades by, and the split it keeps your stocks at (plan §3.4, §3.5). */
export function Targets() {
  const strategy = useApi<Strategy>("/strategy", 120_000);
  const tokens = strategy.data?.tokens ?? [];

  return (
    <div className="flex flex-col gap-6">
      <MarketClock />

      <Section title="Your targets">
        {strategy.loading && !strategy.data ? (
          <Skeleton className="h-24 w-full rounded-[20px]" />
        ) : tokens.length === 0 ? (
          <Card className="px-5 py-4">
            <div className="text-[14px] font-semibold">No targets yet</div>
            <p className="mt-1 text-[13px] text-muted">
              Pick the split your agent keeps your stocks at. It sells what grows past it to top up
              your card.
            </p>
          </Card>
        ) : (
          <>
            <Card className="divide-y divide-line px-4">
              {tokens.map((t) => {
                const symbol = t.symbol ?? `${t.address.slice(0, 8)}…`;
                return (
                  <div key={t.address} className="flex items-center gap-3 py-3">
                    <StockLogo ticker={symbol.replace(/(on|B)$/, "")} size={32} />
                    <span className="min-w-0 flex-1 text-[14px] font-semibold">{symbol}</span>
                    <span className="text-[14px] font-semibold tabular-nums">
                      {pct(t.weight, 0)}
                    </span>
                  </div>
                );
              })}
            </Card>
            <p className="mx-1 mt-2 text-[12px] text-muted">
              Weekly spending estimate: {usd(strategy.data?.weeklyEstimateUsd ?? 0)}
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
