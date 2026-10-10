"use client";
import { usd } from "../../lib/format";
import { CoinBadge, Section } from "../ui";

const CARD =
  "rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]";

/** What the card holds, by token: USD1 to spend, and BNB, which B402 makes unnecessary. */
export function BalanceSection({
  usd1,
  bnb,
  className = "",
}: {
  usd1: number;
  bnb: number;
  className?: string;
}) {
  return (
    <Section
      title="On your card"
      info="On your card, on BNB Chain. Payments use USD1; Binance pays the network fee, so BNB stays at zero."
      className={className}
    >
      <div className={`${CARD} divide-y divide-line`}>
        <div className="flex items-center gap-3 py-3.5">
          <CoinBadge token="USD1" size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">US dollars</div>
            <div className="mt-0.5 text-[11.5px] text-muted">USD1 · ready to spend</div>
          </div>
          <div className="text-[14px] font-semibold tabular-nums">{usd(usd1).slice(1)} USD</div>
        </div>
        {bnb > 0 ? (
          <div className="flex items-center gap-3 py-3.5">
            <CoinBadge token="BNB" size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">BNB</div>
              <div className="mt-0.5 text-[11.5px] text-muted">Not needed to pay</div>
            </div>
            <div className="text-[14px] font-semibold tabular-nums">{bnb.toFixed(4)} BNB</div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
