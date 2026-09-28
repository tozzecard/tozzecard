// RWA Data API. Which price fields to trust: docs/research.md §5.
import { type BinanceClient, BSC_CHAIN_ID, type MarketStatus } from "./index";

export interface RwaStatus {
  openState: boolean;
  marketStatus: MarketStatus | null;
  reasonCode: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

export interface RwaToken {
  tokenContractAddress: string;
  tokenSymbol: string;
  platformId: string;
  underlyingTicker: string;
  decimals: string;
  tokenToShareRatio: string;
  statusInfo: RwaStatus;
  // tokenPrice / referencePrice exist here too but are off by tokenToShareRatio; use rwaPrices.
}

export interface RwaPrice {
  tokenContractAddress: string;
  /** Price of one token, matches an executable quote. */
  tokenPrice: string;
  /** tokenPrice ÷ tokenToShareRatio. Derived from on-chain, not a market quote. */
  referencePrice: string;
  tokenPriceUpdatedAt: number;
}

export function rwaTokens(client: BinanceClient, chainId = BSC_CHAIN_ID) {
  return client.get<RwaToken[]>("/api/v1/dex/market/rwa/tokens", { binanceChainId: chainId });
}

// Docs allow 100 addresses per request, but 100 overflows the URL (HTTP 414); 80 works.
const PRICE_BATCH = 50;

/** Prices for any number of tokens, batched and paced under the rate limit. */
export async function rwaPrices(
  client: BinanceClient,
  addresses: string[],
  chainId = BSC_CHAIN_ID,
) {
  const out: RwaPrice[] = [];
  for (let i = 0; i < addresses.length; i += PRICE_BATCH) {
    if (i) await Bun.sleep(300); // ponytail: fixed pace, a shared limiter if more pollers appear
    const batch = addresses.slice(i, i + PRICE_BATCH).join(",");
    out.push(
      ...(await client.get<RwaPrice[]>("/api/v1/dex/market/rwa/price", {
        binanceChainId: chainId,
        tokenContractAddresses: batch,
      })),
    );
  }
  return out;
}
