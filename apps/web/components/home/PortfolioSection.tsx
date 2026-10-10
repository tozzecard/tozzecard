"use client";
import { useApi } from "../../hooks/useApi";
import type { Holding, Portfolio } from "../../lib/api";
import { pct, usd } from "../../lib/format";
import { StockLogo } from "../StockLogo";
import { Section, Skeleton } from "../ui";

const CARD =
  "rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]";

/** What a non-stock line in the agent wallet is. */
const TOKEN_NAME: Record<string, string> = {
  BNB: "Pays the agent's swap fees",
  USDT: "Tether USD",
  USD1: "World Liberty USD",
  U: "United Stables",
};

const PLATFORM: Record<string, string> = { ondo: "Ondo", bstock: "bStock" };

function Row({ h }: { h: Holding }) {
  const name = h.market?.ticker ?? h.symbol;
  const sub = h.market
    ? `${h.symbol} · ${PLATFORM[h.market.platform] ?? h.market.platform}`
    : (TOKEN_NAME[h.symbol] ?? h.symbol);
  return (
    <div className="flex items-center gap-3 py-3.5">
      <StockLogo ticker={name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{name}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</div>
      </div>
      <div className="text-right">
        <div className="text-[14px] font-semibold tabular-nums">{usd(h.valueUsd)}</div>
        <div className="text-[11.5px] text-muted tabular-nums">
          {pct(h.weight)}
          {h.target > 0 ? ` · target ${pct(h.target, 0)}` : ""}
        </div>
      </div>
    </div>
  );
}

const byKind = (rows: Holding[]) =>
  [...rows].sort(
    (a, b) => Number(Boolean(b.market)) - Number(Boolean(a.market)) || b.valueUsd - a.valueUsd,
  );

/** The agent wallet's rows, stocks first, then tokens. */
export function PortfolioList({ data, loading }: { data: Portfolio | null; loading: boolean }) {
  if (loading && !data) return <Skeleton className="h-[140px] w-full rounded-[16px]" />;
  return (
    <div className={`${CARD} divide-y divide-line`}>
      {byKind(data?.holdings ?? []).map((h) => (
        <Row key={h.address} h={h} />
      ))}
    </div>
  );
}

/**
 * The agent wallet (your Binance Agentic Wallet): the stocks it holds and what they are worth,
 * against your targets. Hidden while the server's agent is off (`/portfolio` 404).
 */
export function PortfolioSection({ className = "" }: { className?: string }) {
  const { data, loading, off } = useApi<Portfolio>("/portfolio", 60_000);
  if (off) return null;
  return (
    <Section
      title="Agent wallet"
      info="Your Binance Agentic Wallet: the stocks the agent manages. It sells a little of what grew past your target and sends the dollars to your card."
      action={
        data ? (
          <span className="text-[14px] font-semibold tabular-nums text-ink">
            {usd(data.totalUsd)}
          </span>
        ) : null
      }
      className={className}
    >
      <PortfolioList data={data} loading={loading} />
    </Section>
  );
}
