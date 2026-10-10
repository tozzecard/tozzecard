"use client";
import { useState } from "react";

/** Stock marks in public/stocks, token marks (Trust Wallet assets) in public/tokens. */
const HAVE = new Set(["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "SPY"]);
const TOKENS = new Set(["BNB", "USDT", "USD1", "U"]);

export function StockLogo({ ticker, size = 36 }: { ticker: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const t = ticker.toUpperCase();
  const dark = t === "AMZN"; // Amazon's mark is white
  if (TOKENS.has(t) && !broken)
    return (
      // biome-ignore lint/performance/noImgElement: tiny static mark
      <img
        src={`/tokens/${t}.png`}
        alt={t}
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  return (
    <span
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-[11px] border ${dark ? "border-ink bg-ink" : "border-line bg-white"}`}
    >
      {HAVE.has(t) && !broken ? (
        // biome-ignore lint/performance/noImgElement: tiny static mark
        <img
          src={`/stocks/${t}.png`}
          alt={t}
          onError={() => setBroken(true)}
          style={{ width: size * 0.68, height: size * 0.68 }}
          className="object-contain"
        />
      ) : (
        <span className="text-[13px] font-semibold text-ink-2">{t.slice(0, 1)}</span>
      )}
    </span>
  );
}
