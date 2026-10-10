/**
 * Every symbol a screen can put a mark against: USD1 is the card's money, BNB is the chain's coin
 * (the card holds none; B402 pays the gas). Drawn, not loaded, so nothing can 404.
 */
export type TokenSym = "USD1" | "BNB";

const STYLE: Record<TokenSym, { bg: string; fg: string; label: string }> = {
  USD1: { bg: "#1a1b1e", fg: "#F0B90B", label: "$" },
  BNB: { bg: "#F0B90B", fg: "#1a1b1e", label: "B" },
};

/** The badge for a symbol; anything unknown gets USD1. */
export function badgeForSymbol(symbol: string): TokenSym {
  return symbol.toUpperCase() === "BNB" ? "BNB" : "USD1";
}

export function CoinBadge({
  token,
  size = 40,
  className = "",
}: {
  token?: TokenSym;
  size?: number;
  className?: string;
}) {
  const key: TokenSym = token ?? "USD1";
  const s = STYLE[key];
  return (
    <span
      role="img"
      aria-label={key}
      style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size * 0.45 }}
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold ${className}`}
    >
      {s.label}
    </span>
  );
}
