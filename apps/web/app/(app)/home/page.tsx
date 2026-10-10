"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReceiveSheet } from "../../../components/account/ReceiveSheet";
import { ActivityList } from "../../../components/activity/ActivityList";
import { CardArtwork } from "../../../components/card/CardArtwork";
import { ActivateCard } from "../../../components/home/ActivateCard";
import { AgentView } from "../../../components/home/AgentView";
import { AvailableHero } from "../../../components/home/AvailableHero";
import { BalanceSection } from "../../../components/home/BalanceSection";
import { WelcomeSplash } from "../../../components/home/WelcomeSplash";
import { CardFolder } from "../../../components/motion/card-folder";
import { ActionPill, ActionRow, Card, Skeleton, SlidingTabs, Toast } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import type { ActivityItem } from "../../../lib/activity";
import { type Activity, ApiError, api, bscscanTx, type Me } from "../../../lib/api";
import { isActive } from "../../../lib/card";
import { ago, signedUsd } from "../../../lib/format";
import { compactHolder } from "../../../lib/holder";

type Mode = "card" | "agent";
const MODES = [
  { key: "card", label: "Card" },
  { key: "agent", label: "Agent wallet" },
] as const;

/** "ALEX LEE" → "Alex Lee" for the folder tab; the card face keeps the embossed capitals. */
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function toItems(rows: Activity[], now: number | null, issuedAt?: number): ActivityItem[] {
  const items: ActivityItem[] = rows.map((r, i) => ({
    id: i,
    cat: r.type === "refill" ? "auto" : "you",
    kind: r.type,
    detail: `${signedUsd(r.usd)}${r.description ? ` · ${r.description}` : ""}`,
    when: now ? ago(r.at, now) : "",
    at: r.at,
    href: r.tx ? bscscanTx(r.tx) : undefined,
    group: "card",
  }));
  // The card is issued the moment the ID check is approved (#51), so its createdAt is when the
  // identity was verified. The statement has no such row, so it is added here.
  if (issuedAt)
    items.push({
      id: -1,
      cat: "you",
      kind: "verified",
      detail: "Your ID was approved and your card issued",
      when: now ? ago(issuedAt, now) : "",
      at: issuedAt,
      group: "card",
    });
  return items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** Home: what the card can spend, the card itself (or the step that activates it), its history. */
export default function HomePage() {
  const router = useRouter();
  const { session } = useCard();
  // While Didit is checking, the card can issue any second: ask every few seconds (#51).
  const [pending, setPending] = useState(false);
  const me = useApi<Me>("/me", pending ? 4_000 : 15_000);
  const activity = useApi<Activity[]>("/me/activity");
  const [shown, setShown] = useState(false);
  const [receiving, setReceiving] = useState(false);
  // Card or agent wallet, switched from the top like Exchange / Wallet in the Binance app.
  const [mode, setMode] = useState<Mode>("card");
  const [welcome, setWelcome] = useState<Mode | null>(null);
  const endWelcome = useCallback(() => setWelcome(null), []);
  const switchTo = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setWelcome(next);
  };
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The clock is read after mount: a relative time baked into server HTML breaks hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const issuedAt = me.data?.kyc === "approved" ? me.data.card?.createdAt : undefined;
  const items = useMemo(
    () => toItems(activity.data ?? [], now, issuedAt),
    [activity.data, now, issuedAt],
  );
  const preview = items.slice(0, 5);
  const data = me.data;
  const active = isActive(data);
  useEffect(() => setPending(data?.kyc === "pending"), [data?.kyc]);
  const card = data?.card;
  const address = data?.address ?? card?.address ?? session?.address ?? "";

  /** Activate: Didit when the API has it (issue #50), otherwise the agent-link steps. */
  const activate = async () => {
    if (!data?.kyc) return router.push("/activate");
    setStarting(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/kyc/session", {
        method: "POST",
        token: session?.token,
        body: { returnUrl: `${window.location.origin}/home` },
      });
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) void me.reload();
      else
        setError(
          e instanceof ApiError && e.status === 503
            ? "Identity checks aren't switched on yet. Try again soon."
            : e instanceof Error
              ? e.message
              : "Could not start verification.",
        );
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {data?.agent.linked ? (
        // Padding on the wrapper: the sliding highlight is positioned against the row itself.
        <div className="mx-auto w-[240px] rounded-full bg-[#E9E9E9] p-1">
          <SlidingTabs
            options={MODES}
            value={mode}
            onChange={switchTo}
            label="Card or agent wallet"
          />
        </div>
      ) : null}
      {welcome ? (
        <WelcomeSplash label={welcome === "card" ? "Card" : "Agent"} onDone={endWelcome} />
      ) : null}

      {mode === "agent" && data?.agent.linked ? (
        <AgentView />
      ) : (
        <div className="stagger">
          <AvailableHero available={data?.balance.usd1} issued={active} />

          {active ? (
            <ActionRow className="mb-[22px]">
              <ActionPill primary onClick={() => router.push("/pay")}>
                Pay
              </ActionPill>
              <ActionPill onClick={() => setReceiving(true)}>Top up</ActionPill>
            </ActionRow>
          ) : null}

          {!data ? (
            <Skeleton className="mx-auto mb-[26px] aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
          ) : active && card ? (
            <div className="mb-[26px] flex justify-center">
              <CardFolder
                title={compactHolder(titleCase(card.holder))}
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
      )}

      <ReceiveSheet open={receiving} onClose={() => setReceiving(false)} address={address} />
      <Toast open={Boolean(error ?? me.error)} message={error ?? me.error ?? ""} />
    </div>
  );
}
