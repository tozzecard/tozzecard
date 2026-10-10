"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { ReceiveSheet } from "../../../components/account/ReceiveSheet";
import { Button, CopyButton } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import type { KycStatus, Me } from "../../../lib/api";

/** "ALEX LEE" → "AL": the first letters of the first and last name. */
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
};

/** "ALEX LEE" → "Alex Lee". */
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STATUS: Record<KycStatus, string> = {
  approved: "ID verified",
  pending: "Verifying your ID",
  declined: "ID not verified",
  duplicate: "ID already used",
  none: "ID not verified yet",
};

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className="shrink-0 text-muted"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const mobilePanel =
  "flex w-full items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3.5 text-left " +
  "[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]";

function Panel({
  icon,
  title,
  body,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={mobilePanel}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden="true"
      >
        {icon}
      </svg>
      <span className="min-w-0 grow">
        <span className="block font-semibold">{title}</span>
        <span className="block text-[12.5px] text-muted">{body}</span>
      </span>
      <Chevron />
    </button>
  );
}

/**
 * Account: who the card belongs to (the name comes from the verified ID, #51), how to add money,
 * the agent's strategy, and log out.
 */
export default function AccountPage() {
  const router = useRouter();
  const { session, signOut } = useCard();
  const me = useApi<Me>("/me", 30_000);
  const [confirming, setConfirming] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const address = me.data?.address ?? me.data?.card?.address ?? session?.address ?? "";
  const name = me.data?.card?.holder ? titleCase(me.data.card.holder) : "";
  const kyc = me.data?.kyc;

  const logout = async () => {
    setConfirming(false);
    await signOut();
    router.replace("/");
  };

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="stagger">
        <div className="pb-1.5 pt-3.5 text-center">
          {name ? (
            <div className="mx-auto flex size-[90px] items-center justify-center rounded-full bg-ink text-[30px] font-semibold tracking-[0.02em] text-white">
              {initials(name)}
            </div>
          ) : address ? (
            <div className="mx-auto w-fit">
              <Identicon address={address} />
            </div>
          ) : null}
          <div className="mt-3 text-[20px] font-semibold">{name || "Your card"}</div>
          {kyc ? (
            <div
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${
                kyc === "approved" ? "bg-[#EAEAEA] text-ink-2" : "bg-pill text-muted"
              }`}
            >
              {kyc === "approved" ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5 9-10" />
                </svg>
              ) : null}
              {STATUS[kyc]}
            </div>
          ) : null}
        </div>

        <section className="mt-5">
          <div className="flex flex-col gap-2.5">
            <Panel
              title="Top up"
              body="Show your card's QR to receive USD1"
              onClick={() => setReceiving(true)}
              icon={
                <>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
                </>
              }
            />
            <Panel
              title="Agent strategy"
              body="Your stocks and what the agent sells"
              onClick={() => router.push("/strategy")}
              icon={
                <>
                  <rect x="4" y="13" width="4" height="7" rx="1.5" />
                  <rect x="10" y="9" width="4" height="11" rx="1.5" />
                  <rect x="16" y="5" width="4" height="15" rx="1.5" />
                </>
              }
            />
            <Panel
              title="History"
              body="Payments and your agent's top-ups"
              onClick={() => router.push("/home")}
              icon={<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />}
            />
          </div>
        </section>

        <section className="mt-5">
          <h2 className="mb-2.5 ml-1 text-sm font-medium text-muted">Details</h2>
          <dl className={`${mobilePanel} flex-col items-stretch gap-0 divide-y divide-line py-1`}>
            {address ? (
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[14.5px]">Card address</dt>
                <dd className="flex items-center gap-2 font-mono text-[13px] font-semibold">
                  {short(address)}
                  <CopyButton value={address} />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-[14.5px]">Network</dt>
              <dd className="text-[14.5px] font-semibold">BNB Chain</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-[14.5px]">You pay in</dt>
              <dd className="text-[14.5px] font-semibold">USD1</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-[14.5px]">Sign-in</dt>
              <dd className="text-[14.5px] font-semibold">Passkey</dd>
            </div>
          </dl>
        </section>

        <Button variant="glass" className="mt-4 text-neg!" onClick={() => setConfirming(true)}>
          Log out
        </Button>
      </div>

      <ReceiveSheet open={receiving} onClose={() => setReceiving(false)} address={address} />
      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
    </div>
  );
}
