"use client";
import { useState } from "react";
import { PreviewCard } from "../../../components/agent/PreviewCard";
import { AgentFeed } from "../../../components/strategy/AgentFeed";
import { Targets } from "../../../components/strategy/Targets";
import { PageHeader, SlidingTabs, TabPanel } from "../../../components/ui";

type Tab = "targets" | "activity" | "preview";

const TABS = [
  { key: "targets", label: "Targets" },
  { key: "activity", label: "Activity" },
  { key: "preview", label: "Preview" },
] as const;

/** Strategy: your targets, the agent's activity and time travel. */
export default function StrategyPage() {
  const [tab, setTab] = useState<Tab>("targets");

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageHeader title="Strategy" />
      {/* The padding lives on this wrapper: the sliding highlight is positioned against the row
          itself, so padding on the row would push the buttons off the highlight. */}
      <div className="mb-4 rounded-full border border-line bg-white p-1">
        <SlidingTabs options={TABS} value={tab} onChange={setTab} label="Strategy sections" />
      </div>
      <TabPanel key={tab}>
        {tab === "targets" ? <Targets /> : tab === "activity" ? <AgentFeed /> : <PreviewCard />}
      </TabPanel>
    </div>
  );
}
