"use client";
import { useEffect, useState } from "react";
import { BottomSheet, Button, Keypad } from "../ui";

/**
 * A figure typed on the app's own keypad, with the digits morphing in as they are typed: a stock's
 * share of the split, or the weekly spend. Opens on the current value; Set hands it back.
 */
export function NumberSheet({
  open,
  title,
  value,
  symbol = "",
  suffix = "",
  decimals = false,
  max,
  onClose,
  onSet,
}: {
  open: boolean;
  title: string;
  value: number;
  symbol?: string;
  suffix?: string;
  decimals?: boolean;
  max?: number;
  onClose: () => void;
  onSet: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    if (open) setDraft(String(value));
  }, [open, value]);

  const n = Number(draft);
  const over = max !== undefined && n > max;

  return (
    <BottomSheet open={open} onClose={onClose} label={title}>
      <h2 className="text-center text-[15px] font-semibold text-muted">{title}</h2>
      {/* Only while open: the keypad listens to the keyboard page-wide, and the sheet stays
          mounted when closed. */}
      <div className="flex h-[420px] flex-col">
        {open ? (
          <Keypad
            value={draft}
            onChange={setDraft}
            symbol={symbol}
            suffix={suffix}
            decimals={decimals}
            invalid={over}
            hint={max !== undefined ? `Up to ${max}${suffix}` : undefined}
          />
        ) : null}
      </div>
      <Button
        type="button"
        disabled={over || Number.isNaN(n)}
        onClick={() => {
          onSet(n);
          onClose();
        }}
      >
        Set
      </Button>
    </BottomSheet>
  );
}
