"use client";
import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { Portfolio } from "../../lib/api";
import { usd } from "../../lib/format";
import { SlidingTabs, TabPanel } from "../ui";
import { BalanceList } from "./BalanceSection";
import { PortfolioList } from "./PortfolioSection";

type Tab = "card" | "agent";

/**
 * The two wallets, one at a time: the card (USD1 to spend) and the agent wallet (the stocks the
 * agent manages). Tabs rather than two stacked lists, so the same token in both never reads as one.
 */
export function WalletsSection({
  usd1,
  bnb,
  className = "",
}: {
  usd1: number;
  bnb: number;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab>("card");
  const portfolio = useApi<Portfolio>("/portfolio", 60_000);
  const options = [
    { key: "card", label: `Card · ${usd(usd1)}` },
    {
      key: "agent",
      label: portfolio.data ? `Agent wallet · ${usd(portfolio.data.totalUsd)}` : "Agent wallet",
    },
  ] as const;

  if (portfolio.off)
    return (
      <div className={className}>
        <BalanceList usd1={usd1} bnb={bnb} />
      </div>
    );

  return (
    <div className={className}>
      {/* Padding on the wrapper: the sliding highlight is positioned against the row itself. */}
      <div className="mb-3 rounded-full border border-line bg-white p-1">
        <SlidingTabs options={options} value={tab} onChange={setTab} label="Wallets" />
      </div>
      <TabPanel key={tab}>
        {tab === "card" ? (
          <BalanceList usd1={usd1} bnb={bnb} />
        ) : (
          <PortfolioList data={portfolio.data} loading={portfolio.loading} />
        )}
      </TabPanel>
    </div>
  );
}
