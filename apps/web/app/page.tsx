"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { CardArtwork } from "../components/card/CardArtwork";
import { Button } from "../components/ui";
import { useCard } from "../hooks/useCard";
import { passkeyError } from "../lib/passkey";

/** The API accepts A–Z, space, . ' - and up to 26 characters (apps/api card.ts cleanHolder). */
const cleanHolder = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z .'-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 26);

type Step = "start" | "name";

/**
 * Onboarding (plan §3.1): make a card with a passkey, or sign back in with one. No seed phrase,
 * no wallet extension. The card key is derived from the passkey on this device and never leaves it.
 */
export default function Onboarding() {
  const router = useRouter();
  const { hydrated, session, create, signIn } = useCard();
  const [step, setStep] = useState<Step>("start");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && session) router.replace("/home");
  }, [hydrated, session, router]);

  const run = async (kind: "create" | "signin", fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      router.replace("/home");
    } catch (e) {
      setError(passkeyError(e));
    } finally {
      setBusy(null);
    }
  };

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    const name = holder.trim();
    if (name.length < 2) return setError("Type the name for your card.");
    void run("create", () => create(name));
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5 pb-10 pt-12">
      <div className="flex items-center gap-2.5">
        <Image src="/tozzecard-icon.svg" alt="" width={28} height={28} priority />
        <span className="text-[17px] font-bold tracking-[-0.02em]">Tozzecard</span>
      </div>

      <div className="mt-10 aspect-[1.586] w-full overflow-hidden rounded-[22px] [box-shadow:0_24px_48px_-24px_rgba(0,0,0,.5)]">
        <CardArtwork holder={cleanHolder(holder) || "YOUR NAME"} detailsVisible={false} />
      </div>

      <h1 className="mt-9 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em]">
        Your stocks,
        <br />
        ready to spend.
      </h1>
      <p className="mt-3 text-[15px] text-muted">
        A card you own, unlocked with Face ID. An agent keeps it topped up in dollars from your
        stocks.
      </p>

      <div className="mt-auto pt-10">
        {step === "start" ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={() => {
                setError(null);
                setStep("name");
              }}
              disabled={busy !== null}
            >
              Create your card
            </Button>
            <Button
              type="button"
              variant="glass"
              onClick={() => void run("signin", signIn)}
              disabled={busy !== null}
            >
              {busy === "signin" ? "Waiting for Face ID…" : "I already have a card"}
            </Button>
          </div>
        ) : (
          <form onSubmit={submitName} className="flex flex-col gap-3">
            <label htmlFor="holder" className="text-[13px] font-medium text-muted">
              Name on the card
            </label>
            <input
              id="holder"
              value={holder}
              onChange={(e) => setHolder(cleanHolder(e.target.value))}
              placeholder="ALEX LEE"
              autoComplete="name"
              // biome-ignore lint/a11y/noAutofocus: the only field on this step
              autoFocus
              className="h-14 rounded-2xl border border-line bg-white px-4 text-base font-medium uppercase tracking-[0.04em] outline-none focus:border-ink"
            />
            <Button type="submit" disabled={busy !== null}>
              {busy === "create" ? "Waiting for Face ID…" : "Continue with Face ID"}
            </Button>
            <button
              type="button"
              onClick={() => setStep("start")}
              className="h-10 text-sm font-medium text-muted"
            >
              Back
            </button>
          </form>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-center text-[13px] text-neg">
            {error}
          </p>
        ) : null}
        <p className="mt-5 text-center text-[12px] text-faint">
          No seed phrase. Your key is made from your passkey and never leaves this device.
        </p>
      </div>
    </main>
  );
}
