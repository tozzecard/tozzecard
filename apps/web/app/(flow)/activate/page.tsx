"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import QRCode from "react-qr-code";
import { BottomSheet, Button, Card, CopyButton } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import type { AgentSession, Me } from "../../../lib/api";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Badge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${
        done ? "bg-pos text-white" : "border border-line-2 bg-white text-ink"
      }`}
    >
      {done ? (
        <svg
          aria-hidden="true"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

function Step({
  n,
  done,
  title,
  body,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3.5 py-4">
      <Badge n={n} done={done} />
      <div className="min-w-0 flex-1 pt-1">
        <div className="text-[15px] font-semibold leading-tight">{title}</div>
        <p className="mt-1 text-[13px] leading-snug text-muted">{body}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * Activating the card without an identity check on the API (issue #50): link the agent to it.
 * The agent wallet can only send to addresses in its address book, which only the holder can edit
 * in the Binance App, so putting this card there (and nothing else) is what lets the agent fill it
 * and nothing else. The API reports the link as `agent.linked`; this page polls it.
 */
export default function ActivatePage() {
  const router = useRouter();
  const me = useApi<Me>("/me", 8_000);
  const session = useApi<AgentSession>("/agent/session", 15_000);
  const [qr, setQr] = useState(false);
  const { session: card } = useCard();
  const address = me.data?.address ?? me.data?.card?.address ?? card?.address ?? "";
  const connected = Boolean(session.data?.connected && !session.data.devMode);
  const linked = Boolean(me.data?.agent.linked);

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        aria-label="Back"
        onClick={() => router.push("/home")}
        className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-ink-2"
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>

      <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.03em]">
        Activate your card
      </h1>
      <p className="mt-1.5 text-[14px] text-muted">Three steps. Your stocks stay in your wallet.</p>

      <Card className="mt-6 px-4">
        <ol className="divide-y divide-line">
          <Step
            n={1}
            done={connected}
            title="Connect your agent"
            body={
              session.off
                ? "Sign in to your Agentic Wallet in the Binance App. The agent isn't running yet."
                : "Sign in to your Agentic Wallet in the Binance App."
            }
          />
          <Step
            n={2}
            done={linked}
            title="Lock it to this card"
            body="Add this address to your Agentic Wallet address book. Nothing else."
          >
            {address ? (
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-full bg-pill px-3 py-2 font-mono text-[12.5px] text-ink-2">
                  {short(address)}
                </code>
                <CopyButton value={address} />
                <button
                  type="button"
                  onClick={() => setQr(true)}
                  className="h-8 shrink-0 rounded-full border border-line bg-white px-3 text-[12px] font-semibold text-ink-2"
                >
                  QR
                </button>
              </div>
            ) : null}
          </Step>
          <Step
            n={3}
            done={false}
            title="Choose your stocks"
            body="Pick the split and roughly what you spend a week."
          >
            <button
              type="button"
              onClick={() => router.push("/targets")}
              className="mt-3 h-9 rounded-full border border-line bg-white px-4 text-[13px] font-semibold text-ink-2"
            >
              Set targets
            </button>
          </Step>
        </ol>
      </Card>

      <div className="mt-auto pt-8">
        <Button type="button" onClick={() => router.push("/home")} disabled={!linked}>
          {linked ? "Done" : "Waiting for step 2…"}
        </Button>
      </div>

      <BottomSheet open={qr} onClose={() => setQr(false)} label="Card address">
        <h2 className="mb-1 text-xl font-semibold">Your card address</h2>
        <p className="mb-5 text-sm text-muted">Scan it from the Binance App address book.</p>
        <div className="mx-auto mb-4 w-fit rounded-[20px] border border-line bg-white p-4">
          <QRCode value={address || " "} size={180} />
        </div>
        <code className="block break-all text-center font-mono text-[12px] text-ink-2">
          {address}
        </code>
      </BottomSheet>
    </div>
  );
}
