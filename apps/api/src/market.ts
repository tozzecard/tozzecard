// Market hours + close reference. The API's referencePrice is derived from the on-chain price
// (docs/research.md §5), so we keep our own: the last per-share price seen in the regular
// session. When the market closes it stops updating, which freezes it at the close.
import type { Database } from "bun:sqlite";
import {
  type BinanceClient,
  type MarketStatus,
  type RwaStatus,
  rwaPrices,
  rwaTokens,
} from "@tozzecard/binance";

// bStock tokens carry no market status (null). Every US equity shares one exchange calendar, so
// they borrow the status of this Ondo token.
// ponytail: single US benchmark; per-exchange benchmarks if non-US underlyings show up.
export const BENCHMARK = "SPYon";

export interface CloseRef {
  perShare: number;
  at: number;
}

export interface MarketView {
  symbol: string;
  address: string;
  platform: string;
  ticker: string;
  ratio: number;
  status: RwaStatus;
  /** "benchmark" when the token has no status of its own and uses BENCHMARK's. */
  statusSource: "token" | "benchmark";
  tokenPrice: number;
  perShare: number;
  priceAt: number;
  closeRef: CloseRef | null;
  /** On-chain token price vs close reference; null until a regular session has been seen. */
  spreadVsClose: number | null;
}

export function spread(tokenPrice: number, ratio: number, ref: CloseRef | null): number | null {
  if (!ref) return null;
  const fair = ref.perShare * ratio;
  return (tokenPrice - fair) / fair;
}

export function createMarket(client: BinanceClient, db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS close_ref (
    address TEXT PRIMARY KEY, per_share REAL NOT NULL, at INTEGER NOT NULL)`);
  const upsert = db.prepare(
    "INSERT INTO close_ref VALUES (?1, ?2, ?3) ON CONFLICT(address) DO UPDATE SET per_share = ?2, at = ?3",
  );
  const readRef = db.prepare<{ per_share: number; at: number }, [string]>(
    "SELECT per_share, at FROM close_ref WHERE address = ?",
  );

  const bySymbol = new Map<string, MarketView>();
  let lastPoll = 0;

  async function poll(now = Date.now()) {
    const tokens = await rwaTokens(client);
    const prices = new Map(
      (
        await rwaPrices(
          client,
          tokens.map((t) => t.tokenContractAddress),
        )
      ).map((p) => [p.tokenContractAddress.toLowerCase(), p]),
    );

    const benchmark = tokens.find((t) => t.tokenSymbol === BENCHMARK)?.statusInfo;

    for (const t of tokens) {
      const own = t.statusInfo?.marketStatus != null;
      const status = own || !benchmark ? t.statusInfo : benchmark;
      const address = t.tokenContractAddress.toLowerCase();
      const p = prices.get(address);
      if (!p) continue;
      const tokenPrice = Number(p.tokenPrice);
      const perShare = Number(p.referencePrice);
      if (status?.marketStatus === ("regular" satisfies MarketStatus) && perShare > 0) {
        upsert.run(address, perShare, p.tokenPriceUpdatedAt || now);
      }
      const row = readRef.get(address);
      const closeRef = row ? { perShare: row.per_share, at: row.at } : null;
      const ratio = Number(t.tokenToShareRatio);
      bySymbol.set(t.tokenSymbol, {
        symbol: t.tokenSymbol,
        address,
        platform: t.platformId,
        ticker: t.underlyingTicker,
        ratio,
        status,
        statusSource: own || !benchmark ? "token" : "benchmark",
        tokenPrice,
        perShare,
        priceAt: p.tokenPriceUpdatedAt,
        closeRef,
        spreadVsClose: spread(tokenPrice, ratio, closeRef),
      });
    }
    lastPoll = now;
  }

  return {
    poll,
    get: (symbol: string) => bySymbol.get(symbol),
    all: () => [...bySymbol.values()],
    lastPoll: () => lastPoll,
  };
}

export type Market = ReturnType<typeof createMarket>;
