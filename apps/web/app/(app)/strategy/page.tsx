"use client";
import Link from "next/link";
import { AgentFeed } from "../../../components/strategy/AgentFeed";
import { Targets } from "../../../components/strategy/Targets";
import { PageHeader } from "../../../components/ui";

/**
 * Strategy tab: everything about the agent. The market clock, your targets (edit at /targets),
 * time travel and its decision feed. What it holds is on Home, under Portfolio.
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
        <Targets />
        <AgentFeed />
      </div>
    </div>
  );
}
