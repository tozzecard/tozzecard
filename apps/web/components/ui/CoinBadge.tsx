/**
 * Every symbol a screen can put a mark against: USD1 is the card's money, BNB is the chain's coin
 * (the card holds none; B402 pays the gas). Marks from Trust Wallet's assets, in public/tokens.
 */
export type TokenSym = "USD1" | "BNB";

/** The badge for a symbol; anything unknown gets USD1. */
export function badgeForSymbol(symbol: string): TokenSym {
  return symbol.toUpperCase() === "BNB" ? "BNB" : "USD1";
}

/** Circular logo. `object-cover` keeps non-circular source art inside the round badge. */
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
  return (
    // biome-ignore lint/performance/noImgElement: static asset that must paint the moment it appears
    <img
      src={`/tokens/${key}.png`}
      alt={key}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
