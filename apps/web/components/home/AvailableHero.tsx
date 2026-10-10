"use client";
import { usd } from "../../lib/format";
import { InfoTip } from "../ui";

/**
 * Home's headline: what the card can spend right now, its USD1 balance. Before the card is
 * activated there is nothing to spend from, so it says so instead of showing a figure.
 * An unread figure is a dash. `0` is a claim about someone's money.
 */
export function AvailableHero({
  available,
  issued,
}: {
  available: number | undefined;
  issued: boolean;
}) {
  return (
    <div className="py-[26px]">
      <div className="flex items-center gap-1.5 text-[15px] font-medium text-muted">
        {issued ? "Available" : "Your card"}
        {issued ? (
          <InfoTip label="Available">
            Dollars on your card, ready to spend. Your agent tops it up from your stocks while the
            market is open.
          </InfoTip>
        ) : null}
      </div>
      {!issued ? (
        <div className="mt-2 text-[clamp(26px,8vw,34px)] font-semibold leading-tight tracking-[-.02em]">
          Not issued yet
        </div>
      ) : available === undefined ? (
        <div className="mt-2 text-[clamp(32px,12vw,54px)] font-semibold leading-none">—</div>
      ) : (
        <div className="mt-2 whitespace-nowrap text-[clamp(30px,10vw,50px)] font-semibold leading-[1.1] tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {usd(available)}
        </div>
      )}
    </div>
  );
}
