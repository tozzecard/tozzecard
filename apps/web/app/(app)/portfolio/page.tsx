"use client";
import { useEffect, useState } from "react";
import { Card, PageHeader, Section, Skeleton } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import type { Market, Portfolio } from "../../../lib/api";
import { pct, until, usd } from "../../../lib/format";

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

function WeightBar({ weight, target }: { weight: number; target: number }) {
  return (
    <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pill">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-ink"
        style={{ width: `${Math.min(100, weight * 100)}%` }}
      />
      <div
        className="absolute inset-y-[-3px] w-0.5 bg-neg"
        style={{ left: `${Math.min(100, target * 100)}%` }}
        title="Target"
      />
    </div>
  );
}

/** Stocks tab (plan §3.4, §3.5): what the agent holds against your targets, and the market clock. */
export default function PortfolioPage() {
  const portfolio = useApi<Portfolio>("/portfolio", 60_000);
  const strategy = useApi<Strategy>("/strategy", 120_000);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageHeader title="Stocks" description="Held in your own Binance Agentic Wallet." />

      <div className="mb-5">
        <MarketClock />
      </div>

      {portfolio.data ? (
        <>
          <Card className="mb-5 px-5 py-5">
            <div className="text-[13px] font-medium text-muted">Portfolio</div>
            <div className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {usd(portfolio.data.totalUsd)}
            </div>
            <div className="mt-2 text-[13px] text-muted">
              Card: {usd(portfolio.data.card.usd1)} USD1
            </div>
          </Card>
          <Section title="Holdings">
            <Card className="divide-y divide-line px-5">
              {portfolio.data.holdings.map((h) => (
                <div key={h.address} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[15px] font-semibold">
                        {h.market?.ticker ?? h.symbol}
                      </span>
                      <span className="ml-2 text-[12px] text-muted">{h.symbol}</span>
                    </div>
                    <span className="text-[15px] font-semibold tabular-nums">
                      {usd(h.valueUsd)}
                    </span>
                  </div>
                  <WeightBar weight={h.weight} target={h.target} />
                  <div className="mt-1.5 flex justify-between text-[12px] text-muted">
                    <span>{pct(h.weight)} of portfolio</span>
                    <span>target {pct(h.target)}</span>
                  </div>
                </div>
              ))}
            </Card>
          </Section>
        </>
      ) : portfolio.loading ? (
        <Skeleton className="h-40 w-full rounded-[20px]" />
      ) : (
        <>
          <Card className="mb-5 px-5 py-4">
            <div className="text-[14px] font-semibold">Your agent isn&apos;t running yet</div>
            <p className="mt-1 text-[13px] text-muted">
              Holdings appear here once the agent is connected to your Agentic Wallet.
            </p>
          </Card>
          {strategy.data && strategy.data.tokens.length > 0 ? (
            <Section title="Your targets">
              <Card className="divide-y divide-line px-5">
                {strategy.data.tokens.map((t) => (
                  <div key={t.address} className="flex justify-between py-3.5 text-[14px]">
                    <span className="font-semibold">{t.symbol ?? `${t.address.slice(0, 8)}…`}</span>
                    <span className="tabular-nums text-muted">{pct(t.weight, 0)}</span>
                  </div>
                ))}
              </Card>
              <p className="mx-1 mt-2 text-[12px] text-muted">
                Weekly spending estimate: {usd(strategy.data.weeklyEstimateUsd)}
              </p>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
