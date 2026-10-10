"use client";
import type { KycStatus } from "../../lib/api";
import { CardArtwork } from "../card/CardArtwork";
import { Button, Spinner } from "../ui";

/**
 * The card before it is active: the real card face, blurred and dimmed, with the one step that
 * activates it on top. With an identity check on the API (issue #50) that step is Didit; until
 * then it is linking the agent (the card's address in the Agentic Wallet address book).
 *
 * `pending` can last hours (manual review), so it shows no spinner and never starts a new session
 * by itself: a new session replaces the stored one and an approval of the old one would be lost.
 */
export function ActivateCard({
  kyc,
  busy,
  onContinue,
  className = "",
}: {
  /** Undefined when the API has no identity check. */
  kyc: KycStatus | undefined;
  busy: boolean;
  onContinue: () => void;
  className?: string;
}) {
  const [title, body, action] =
    kyc === "pending"
      ? ["Verifying your ID", "This updates by itself. It can take a few minutes.", null]
      : kyc === "duplicate"
        ? ["This ID already has a card", "One person, one card.", null]
        : kyc === "declined"
          ? ["Verification failed", "Try again with a clear photo of your ID.", "Try again"]
          : kyc === "none"
            ? ["Activate your card", "An ID photo and a selfie. About a minute.", "Continue"]
            : ["Activate your card", "", "Continue"];

  return (
    <section
      aria-label="Your card, not issued yet"
      className={`relative mx-auto aspect-[1.586] w-full max-w-[340px] overflow-hidden rounded-[22px] ${className}`}
    >
      <div aria-hidden="true" className="absolute inset-0 scale-110 blur-[7px]">
        <CardArtwork holder="" expiry="••/••" detailsVisible={false} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 px-6 text-center text-white">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
        {body ? <p className="mt-1 text-[13px] text-white/75">{body}</p> : null}
        {action ? (
          <Button
            variant="glass"
            size="md"
            className="mt-3 !w-auto px-7"
            disabled={busy}
            onClick={onContinue}
          >
            {busy ? <Spinner /> : action}
          </Button>
        ) : kyc === "pending" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onContinue}
            className="mt-3 text-[12.5px] text-white/80 underline underline-offset-2 disabled:opacity-50"
          >
            Didn&apos;t finish? Start again
          </button>
        ) : null}
      </div>
    </section>
  );
}
