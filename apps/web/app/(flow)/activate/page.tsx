"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import QRCode from "react-qr-code";
import { Button, CopyButton } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import type { AgentSession, Me } from "../../../lib/api";

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3.5 border-t border-line py-5 first:border-t-0">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${done ? "bg-pos text-white" : "bg-pill text-ink-2"}`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="mt-1 text-[13px] text-muted">{children}</div>
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
  const address = me.data?.card?.address ?? "";
  const connected = Boolean(session.data?.connected && !session.data.devMode);
  const linked = Boolean(me.data?.agent.linked);

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={() => router.push("/home")}
        className="self-start text-sm font-medium text-muted"
      >
        ← Home
      </button>
      <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.03em]">Activate your card</h1>
      <p className="mt-1 text-[14px] text-muted">
        Three steps in the Binance App and here. Your stocks never leave your own wallet.
      </p>

      <ol className="mt-4">
        <Step n={1} done={connected} title="Connect your agent">
          Sign in to your Binance Agentic Wallet and confirm in the Binance App. Keep Developer Mode
          off.
          {session.off ? " The agent isn't running on the server yet." : ""}
        </Step>
        <Step n={2} done={linked} title="Lock it to this card">
          In the Binance App, add this address to your Agentic Wallet address book, and nothing
          else. Set a daily limit you are comfortable with.
          {address ? (
            <span className="mt-3 block rounded-2xl border border-line bg-white p-3">
              <span className="mx-auto mb-3 block w-fit">
                <QRCode value={address} size={120} />
              </span>
              <span className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-2">
                  {address}
                </code>
                <CopyButton value={address} />
              </span>
            </span>
          ) : null}
        </Step>
        <Step n={3} done={false} title="Choose your stocks">
          Pick the split and roughly what you spend a week.{" "}
          <Link href="/targets" className="font-semibold text-ink underline underline-offset-2">
            Set targets
          </Link>
        </Step>
      </ol>

      <div className="mt-auto pt-6">
        <Button type="button" onClick={() => router.push("/home")} disabled={!linked}>
          {linked ? "Done" : "Waiting for the address book…"}
        </Button>
      </div>
    </div>
  );
}
