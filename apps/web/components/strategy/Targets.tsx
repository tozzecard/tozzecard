"use client";
import Link from "next/link";
import { useApi } from "../../hooks/useApi";
import { pct, usd } from "../../lib/format";
import { StockLogo } from "../StockLogo";
import { Card, Skeleton } from "../ui";

interface Strategy {
  targets: Record<string, number>;
  weeklyEstimateUsd: number;
  tokens: { address: string; symbol: string | null; weight: number }[];
}

/** The split the agent keeps your stocks at (plan §3.4, §3.5). Edit at /targets. */
export function Targets() {
  const { data, loading } = useApi<Strategy>("/strategy", 120_000);
  const tokens = data?.tokens ?? [];

  if (loading && !data) return <Skeleton className="h-28 w-full rounded-[20px]" />;

  if (tokens.length === 0)
    return (
      <Card className="flex flex-col items-center px-5 py-8 text-center">
        <div className="text-[15px] font-semibold">No targets yet</div>
        <p className="mt-1 text-[13px] text-muted">Pick your stocks and the split.</p>
        <Link
          href="/targets"
          className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-[13.5px] font-semibold text-white"
        >
          Set targets
        </Link>
      </Card>
    );

  return (
    <>
      <Card className="divide-y divide-line px-4">
        {tokens.map((t) => {
          const symbol = t.symbol ?? `${t.address.slice(0, 8)}…`;
          return (
            <div key={t.address} className="flex items-center gap-3 py-3">
              <StockLogo ticker={symbol.replace(/(on|B)$/, "")} size={32} />
              <span className="min-w-0 flex-1 text-[14px] font-semibold">{symbol}</span>
              <span className="text-[14px] font-semibold tabular-nums">{pct(t.weight, 0)}</span>
            </div>
          );
        })}
      </Card>
      <p className="mx-1 mt-2 text-[12px] text-muted">
        About {usd(data?.weeklyEstimateUsd ?? 0)} spent a week
      </p>
    </>
  );
}
