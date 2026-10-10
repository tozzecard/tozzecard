/** "$1,234.56". Cents always shown: this is money someone will spend. */
export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** "+$12.00" / "−$4.50" for statement rows. */
export const signedUsd = (n: number) => `${n < 0 ? "−" : "+"}${usd(Math.abs(n))}`;

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/** "3m ago", "2h ago", "Oct 4". Call from an effect or a client-only render, never on the server. */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2h 14m" until a time, for the market clock. */
export function until(at: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((at - now) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
