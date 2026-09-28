// G6: compare every price the API gives for one token against what you can actually sell it for.
// Run: bun run --cwd packages/binance price-check NVDAon ECOon
import { BSC_CHAIN_ID, clientFromEnv } from "../src";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
// Any address works for a quote; RFQ routes (Ondo, bStock) require one.
const QUOTE_WALLET = "0x000000000000000000000000000000000000dEaD";

const c = clientFromEnv();
// ponytail: fixed pause to stay under the 5 RPS/endpoint limit (42900); a real limiter if we poll.
const pause = () => Bun.sleep(400);

type ListToken = {
  tokenSymbol: string;
  tokenContractAddress: string;
  decimals: string;
  tokenToShareRatio: string;
  tokenPrice: string;
  referencePrice: string;
  statusInfo: { marketStatus: string };
};

const list = await c.get<ListToken[]>("/api/v1/dex/market/rwa/tokens", {
  binanceChainId: BSC_CHAIN_ID,
});
const symbols = process.argv.slice(2);
if (!symbols.length) throw new Error("Usage: price-check <symbol...>, e.g. NVDAon");

for (const sym of symbols) {
  const t = list.find((x) => x.tokenSymbol === sym);
  if (!t) {
    console.log(`${sym}: not in the BSC token list`);
    continue;
  }
  const q = { binanceChainId: BSC_CHAIN_ID, tokenContractAddress: t.tokenContractAddress };
  await pause();
  const [price] = await c.get<{ tokenPrice: string; referencePrice: string }[]>(
    "/api/v1/dex/market/rwa/price",
    { binanceChainId: BSC_CHAIN_ID, tokenContractAddresses: t.tokenContractAddress },
  );
  await pause();
  const um = await c.get<{ marketData: { referencePrice: string } }>(
    "/api/v1/dex/market/rwa/underlying-market",
    q,
  );
  // Quote ~$10 worth: the API rejects orders under $5 (40375), and 1 token can be worth cents.
  const units = BigInt(Math.ceil((10 / Number(price.tokenPrice)) * 1e6));
  const amount = units * 10n ** BigInt(Number(t.decimals) - 6);
  await pause();
  const [quote] = await c.get<{ toTokenAmount: string; priceImpactPercent: string }[]>(
    "/api/v1/dex/aggregator/quote",
    {
      binanceChainId: BSC_CHAIN_ID,
      amount: amount.toString(),
      fromTokenAddress: t.tokenContractAddress,
      toTokenAddress: USDT,
      userWalletAddress: QUOTE_WALLET,
    },
  );

  // BSC USDT has 18 decimals; divide by tokens sold to get the price of one token
  const sell = Number(quote.toTokenAmount) / 1e18 / (Number(units) / 1e6);
  const pct = (v: string) => `${(((Number(v) - sell) / sell) * 100).toFixed(2)}%`;
  console.log(`\n${sym}  market=${t.statusInfo.marketStatus}  ratio=${t.tokenToShareRatio}`);
  console.table({
    "quote: sell ~$10 → USDT, per token": { value: sell, vsQuote: "0%" },
    "/tokens tokenPrice": { value: +t.tokenPrice, vsQuote: pct(t.tokenPrice) },
    "/tokens referencePrice": { value: +t.referencePrice, vsQuote: pct(t.referencePrice) },
    "/price tokenPrice": { value: +price.tokenPrice, vsQuote: pct(price.tokenPrice) },
    "/price referencePrice": { value: +price.referencePrice, vsQuote: pct(price.referencePrice) },
    "/underlying-market referencePrice": {
      value: +um.marketData.referencePrice,
      vsQuote: pct(um.marketData.referencePrice),
    },
  });
}
