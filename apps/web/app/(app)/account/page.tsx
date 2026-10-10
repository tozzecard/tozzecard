"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { Card, CopyButton, PageHeader } from "../../../components/ui";
import { useApi } from "../../../hooks/useApi";
import { useCard } from "../../../hooks/useCard";
import type { Me } from "../../../lib/api";

const KYC_LABEL: Record<string, string> = {
  approved: "Verified",
  pending: "In review",
  declined: "Not verified",
  duplicate: "Already used for another card",
  none: "Not verified yet",
};

/**
 * Account tab: who the card belongs to and how to leave. The name comes from the verified ID
 * (#51), so it is shown, not edited.
 */
export default function AccountPage() {
  const router = useRouter();
  const { session, signOut } = useCard();
  const me = useApi<Me>("/me", 60_000);
  const [confirming, setConfirming] = useState(false);
  const address = me.data?.address ?? me.data?.card?.address ?? session?.address ?? "";
  const kyc = me.data?.kyc;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col">
      <PageHeader title="Account" description="Your card and how you sign in." />

      <Card className="divide-y divide-line px-5">
        <div className="py-4">
          <div className="text-[13px] font-medium text-muted">Name on the card</div>
          <div className="mt-1 text-[15px] font-semibold uppercase tracking-[0.03em]">
            {me.data?.card?.holder ?? "Issued after you verify your ID"}
          </div>
        </div>
        {kyc ? (
          <div className="py-4">
            <div className="text-[13px] font-medium text-muted">Identity</div>
            <div className="mt-1 text-[15px] font-semibold">{KYC_LABEL[kyc] ?? kyc}</div>
          </div>
        ) : null}
        {address ? (
          <div className="py-4">
            <div className="text-[13px] font-medium text-muted">Card address · BNB Chain</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-ink-2">
                {address}
              </code>
              <CopyButton value={address} />
            </div>
          </div>
        ) : null}
        <div className="py-4">
          <div className="text-[13px] font-medium text-muted">Sign-in</div>
          <div className="mt-1 text-[15px] font-semibold">Passkey on this device</div>
        </div>
      </Card>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-6 h-12 w-full rounded-full text-[15px] font-semibold text-neg"
      >
        Sign out
      </button>
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
