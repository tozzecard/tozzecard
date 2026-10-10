"use client";
import Link from "next/link";
import { AgentFeed } from "../../../components/strategy/AgentFeed";
import { Holdings } from "../../../components/strategy/Holdings";
import { PageHeader } from "../../../components/ui";

/**
 * Strategy tab: everything about the agent in one place. The market clock and what it holds
 * against your targets, the targets themselves (/targets), time travel, and its decision feed.
 */
export default function StrategyPage() {
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageHeader
        title="Strategy"
        description="Your stocks, held in your own Binance Agentic Wallet."
        action={
          <Link
            href="/targets"
            className="inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-[13px] font-semibold text-ink-2"
          >
            Set targets
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <Holdings />
        <AgentFeed />
      </div>
    </div>
  );
}
