"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { Button, Card, CopyButton, PageHeader } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import { api, type Card as CardFace, type Me } from "../../../lib/api";

/** The API accepts A–Z, space, . ' - and up to 26 characters (apps/api card.ts cleanHolder). */
const cleanHolder = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z .'-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 26);

/** Account tab: the name on the card (PATCH /me), its address, sign out. */
export default function AccountPage() {
  const router = useRouter();
  const { session, signOut } = useCard();
  const me = useApi<Me>("/me", 600_000);
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (me.data?.card && !holder) setHolder(me.data.card.holder);
  }, [me.data, holder]);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const { card } = await api<{ card: CardFace }>("/me", {
        method: "PATCH",
        token: session?.token,
        body: { holder: holder.trim() },
      });
      setHolder(card.holder);
      setNote("Saved.");
      void me.reload();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col">
      <PageHeader title="Account" description="Your card and how you sign in." />

      <form onSubmit={rename} className="flex flex-col">
        <label htmlFor="holder" className="text-[13px] font-medium text-muted">
          Name on the card
        </label>
        <input
          id="holder"
          value={holder}
          onChange={(e) => setHolder(cleanHolder(e.target.value))}
          className="mt-2 h-14 rounded-2xl border border-line bg-white px-4 text-base font-medium uppercase tracking-[0.04em] outline-none focus:border-ink"
        />
        <div className="mt-3">
          <Button
            type="submit"
            variant="glass"
            disabled={busy || holder.trim().length < 2 || holder === me.data?.card?.holder}
          >
            {busy ? "Saving…" : "Save name"}
          </Button>
        </div>
        {note ? <p className="mt-2 text-center text-[13px] text-muted">{note}</p> : null}
      </form>

      {me.data?.card ? (
        <Card className="mt-6 px-5 py-4">
          <div className="text-[13px] font-medium text-muted">Card address · BNB Chain</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-2">
              {me.data.card.address}
            </code>
            <CopyButton value={me.data.card.address} />
          </div>
        </Card>
      ) : null}

      <div className="pt-8">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-12 w-full text-[15px] font-semibold text-neg"
        >
          Sign out
        </button>
      </div>
      <LogoutSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void signOut().then(() => router.replace("/"));
        }}
      />
    </div>
  );
}
