// G5: prove the key works and time the first calls. Run: bun run --cwd packages/binance first-call
import { BSC_CHAIN_ID, clientFromEnv } from "../src";

const client = clientFromEnv();

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t = performance.now();
  const out = await fn();
  console.log(`${label}: ${Math.round(performance.now() - t)} ms`);
  return out;
}

type Platform = { platformId: string; tickerCount: number };
type Token = {
  tokenSymbol: string;
  platformId: string;
  tokenPrice: string;
  referencePrice: string;
  statusInfo: { marketStatus: string; nextOpenTime: number | null };
};

const platforms = await timed("rwa/platforms", () =>
  client.get<Platform[]>("/api/v1/dex/market/rwa/platforms"),
);
console.table(platforms.map(({ platformId, tickerCount }) => ({ platformId, tickerCount })));

const tokens = await timed("rwa/tokens (BSC)", () =>
  client.get<Token[]>("/api/v1/dex/market/rwa/tokens", { binanceChainId: BSC_CHAIN_ID }),
);
console.log(`${tokens.length} tokens on BSC`);
console.table(
  tokens.slice(0, 5).map((t) => ({
    symbol: t.tokenSymbol,
    platform: t.platformId,
    tokenPrice: t.tokenPrice,
    referencePrice: t.referencePrice,
    market: t.statusInfo?.marketStatus,
  })),
);
