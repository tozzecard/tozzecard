"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ReceiveSheet } from "../../../components/account/ReceiveSheet";
import { ActivityList } from "../../../components/activity/ActivityList";
import { CardArtwork } from "../../../components/card/CardArtwork";
import { CardFolder } from "../../../components/motion/card-folder";
import { ActionPill, ActionRow, Card, Section, Skeleton } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import type { ActivityItem } from "../../../lib/activity";
import { type Activity, bscscanTx, type Me } from "../../../lib/api";
import { ago, signedUsd, usd } from "../../../lib/format";

/** "ALEX LEE" → "Alex Lee" for the folder tab; the card face keeps the embossed capitals. */
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function toItems(rows: Activity[], now: number | null): ActivityItem[] {
  return rows.map((r, i) => ({
    id: i,
    cat: r.type === "refill" ? "auto" : "you",
    kind: r.type,
    detail: `${signedUsd(r.usd)}${r.description ? ` · ${r.description}` : ""}`,
    when: now ? ago(r.at, now) : "",
    at: r.at,
    href: r.tx ? bscscanTx(r.tx) : undefined,
    group: "card",
  }));
}

/** Card tab (plan §3.2, §3.6): the card face, what it can spend, and its statement. */
export default function HomePage() {
  const me = useApi<Me>("/me");
  const activity = useApi<Activity[]>("/me/activity");
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [sheet, setSheet] = useState<"receive" | null>(null);
  // The clock is read after mount: a relative time baked into server HTML breaks hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const items = useMemo(() => toItems(activity.data ?? [], now), [activity.data, now]);
  const card = me.data?.card;

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-[26px] flex justify-center">
        {card ? (
          <CardFolder
            title={titleCase(card.holder)}
            ariaLabel={`Your card, ${card.holder}`}
            cardNumber={card.number}
            expiry={card.expiry}
            cvv={card.cvv}
            detailsVisible={shown}
            onDetailsVisibleChange={setShown}
            className="w-full max-w-[340px]"
            card={
              <CardArtwork
                holder={card.holder}
                number={card.number}
                expiry={card.expiry}
                detailsVisible={shown}
              />
            }
          />
        ) : (
          <Skeleton className="aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
        )}
      </div>

      <Card className="mb-4 px-5 py-5">
        <div className="text-[13px] font-medium text-muted">Ready to spend</div>
        <div className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          {me.data ? usd(me.data.balance.usd1) : <Skeleton className="h-10 w-40" />}
        </div>
        <div className="mt-2 text-[13px] text-muted">USD1 on BNB Chain · no BNB needed to pay</div>
        <ActionRow className="mt-4">
          <ActionPill primary onClick={() => router.push("/pay")}>
            Pay
          </ActionPill>
          <ActionPill onClick={() => setSheet("receive")} disabled={!card}>
            Add money
          </ActionPill>
          <ActionPill onClick={() => router.push("/settings")}>Settings</ActionPill>
        </ActionRow>
      </Card>

      {me.data && !me.data.agent.linked ? (
        <Card className="mb-4 px-5 py-4">
          <div className="text-[14px] font-semibold">Let the agent top up this card</div>
          <p className="mt-1 text-[13px] text-muted">
            In the Binance App, add this card&apos;s address to your Agentic Wallet address book. It
            is the only address the agent will ever be able to send to.
          </p>
          <code className="mt-3 block break-all rounded-xl bg-pill px-3 py-2 font-mono text-[12px] text-ink-2">
            {me.data.card.address}
          </code>
        </Card>
      ) : null}

      {me.data?.agent.linked ? (
        <Card className="mb-4 flex items-center gap-3 px-5 py-4">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-pos" />
          <p className="text-[13px] text-ink-2">
            {me.data.agent.mode === "live"
              ? "Your agent tops up this card while the market is open."
              : me.data.agent.mode === "dry"
                ? "Your agent is planning top-ups but not trading yet."
                : "Your agent is paused."}
          </p>
        </Card>
      ) : null}

      {me.error ? <p className="mb-4 text-center text-[13px] text-neg">{me.error}</p> : null}

      <Section title="Activity">
        <ActivityList
          items={items}
          loading={activity.loading}
          now={now}
          emptyTitle="No activity yet"
          emptyDescription="Payments and the agent's top-ups show up here."
        />
      </Section>

      <ReceiveSheet
        open={sheet === "receive"}
        onClose={() => setSheet(null)}
        address={card?.address ?? ""}
      />
    </div>
  );
}
