"use client";
import { useRouter } from "next/navigation";
import { useApi } from "../../hooks/useApi";
import type { Portfolio } from "../../lib/api";
import { usd } from "../../lib/format";
import { ActionPill, ActionRow, Card, InfoTip } from "../ui";
import { PortfolioList } from "./PortfolioSection";

/** Home in agent-wallet mode: what the agent manages, and the way to its strategy. */
export function AgentView() {
  const router = useRouter();
  const { data, loading, off } = useApi<Portfolio>("/portfolio", 60_000);

  return (
    <div className="stagger">
      <div className="py-[26px]">
        <div className="flex items-center gap-1.5 text-[15px] font-medium text-muted">
          Agent wallet
          <InfoTip label="Agent wallet">
            Your Binance Agentic Wallet. The agent sells a little of what grew past your target and
            sends the dollars to your card.
          </InfoTip>
        </div>
        <div className="mt-2 whitespace-nowrap text-[clamp(30px,10vw,50px)] font-semibold leading-[1.1] tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {data ? usd(data.totalUsd) : "—"}
        </div>
      </div>

      <ActionRow className="mb-[22px]">
        <ActionPill primary onClick={() => router.push("/strategy")}>
          Strategy
        </ActionPill>
      </ActionRow>

      {off ? (
        <Card className="px-5 py-6 text-center text-[13px] text-muted">
          The agent isn&apos;t running.
        </Card>
      ) : (
        <>
          <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Holdings</h2>
          <PortfolioList data={data} loading={loading} />
        </>
      )}
    </div>
  );
}
