"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ReceiveSheet } from "../../../components/account/ReceiveSheet";
import { ActivityList } from "../../../components/activity/ActivityList";
import { CardArtwork } from "../../../components/card/CardArtwork";
import { ActivateCard } from "../../../components/home/ActivateCard";
import { AvailableHero } from "../../../components/home/AvailableHero";
import { BalanceSection } from "../../../components/home/BalanceSection";
import { CardFolder } from "../../../components/motion/card-folder";
import { ActionPill, ActionRow, Card, Skeleton, Toast } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import type { ActivityItem } from "../../../lib/activity";
import { type Activity, api, bscscanTx, type Me } from "../../../lib/api";
import { isActive } from "../../../lib/card";
import { ago, signedUsd } from "../../../lib/format";

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

/** Home: what the card can spend, the card itself (or the step that activates it), its history. */
export default function HomePage() {
  const router = useRouter();
  const { session } = useCard();
  const me = useApi<Me>("/me", 15_000);
  const activity = useApi<Activity[]>("/me/activity");
  const [shown, setShown] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The clock is read after mount: a relative time baked into server HTML breaks hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const items = useMemo(() => toItems(activity.data ?? [], now), [activity.data, now]);
  const preview = items.slice(0, 5);
  const data = me.data;
  const active = isActive(data);
  const card = data?.card;

  /** Activate: Didit when the API has it (issue #50), otherwise the agent-link steps. */
  const activate = async () => {
    if (!data?.kyc) return router.push("/activate");
    setStarting(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/kyc/session", {
        method: "POST",
        token: session?.token,
      });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification.");
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="stagger">
        <AvailableHero available={data?.balance.usd1} issued={active} />

        {active ? (
          <ActionRow className="mb-[22px]">
            <ActionPill primary onClick={() => router.push("/pay")}>
              Pay
            </ActionPill>
            <ActionPill onClick={() => setReceiving(true)}>Add money</ActionPill>
          </ActionRow>
        ) : null}

        {!data ? (
          <Skeleton className="mx-auto mb-[26px] aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
        ) : active && card ? (
          <div className="mb-[26px] flex justify-center">
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
          </div>
        ) : (
          <ActivateCard
            className="mb-[26px]"
            kyc={data.kyc}
            busy={starting}
            onContinue={() => void activate()}
          />
        )}

        {active && data ? (
          <BalanceSection className="mb-[22px]" usd1={data.balance.usd1} bnb={data.balance.bnb} />
        ) : null}

        <h2 className="mx-1 mb-2 text-sm font-medium text-muted">History</h2>
        <Card className="px-5 pb-2 pt-1">
          <ActivityList
            items={preview}
            loading={activity.loading}
            now={now}
            emptyTitle="Nothing yet"
            emptyDescription="Payments and your agent's top-ups will show here."
          />
        </Card>
      </div>

      <ReceiveSheet
        open={receiving}
        onClose={() => setReceiving(false)}
        address={card?.address ?? ""}
      />
      <Toast open={Boolean(error ?? me.error)} message={error ?? me.error ?? ""} />
    </div>
  );
}
