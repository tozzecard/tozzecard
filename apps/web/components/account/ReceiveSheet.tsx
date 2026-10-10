"use client";
import QRCode from "react-qr-code";
import { BottomSheet, CopyButton } from "../ui";

/**
 * Adding money to the card: its address as a QR and as text to copy. The `0x` address lives here
 * and on the address book step, the two places someone needs it.
 */
export function ReceiveSheet({
  open,
  onClose,
  address,
}: {
  open: boolean;
  onClose: () => void;
  address: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Receive money">
      <h2 className="mb-1 text-xl font-semibold">Receive money</h2>
      <p className="mb-5 text-sm text-muted">Scan this to send USD1 to your card, on BNB Chain.</p>
      <div className="mx-auto mb-5 w-fit rounded-[20px] border border-line bg-white p-4">
        <QRCode value={address} size={184} bgColor="#ffffff" fgColor="#111316" />
      </div>
      <div className="flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-muted">Your card address</div>
          <div className="mt-0.5 break-all font-mono text-[12.5px] text-ink-2">{address}</div>
        </div>
        <CopyButton value={address} label="Copy your account" />
      </div>
    </BottomSheet>
  );
}
