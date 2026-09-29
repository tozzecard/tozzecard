// Price impact of real quotes vs the underlying stock (G3, demo §8.5 weekend contrast).
// bps = executable quote vs fair, fair = stockInfo.price × sharesMultiplier. Over a weekend
// stockInfo.price is Friday's close, so the sell column is "what selling now costs vs Friday".
// Public endpoints, no API key. Read-only (quotes only).
// Run: bun packages/agent/scripts/price-impact.ts NVDA AAPL TSLA
import { quote, USDT } from "../src";

const BAPI = "https://www.binance.com/bapi/defi";
const SIZES = [5, 20, 50];
const PROVIDERS = [
  { type: 1, name: "Ondo" },
  { type: 3, name: "bStock" },
];

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BAPI + path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return ((await res.json()) as { data: T }).data;
}

type Listed = { chainId: string; contractAddress: string; ticker: string };
type Dynamic = {
  tokenInfo: { price: string; sharesMultiplier: string };
  stockInfo: { price: string | null };
  statusInfo: { marketStatus: string | null };
};

const bps = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 1e4)}`;
/** One markdown table row. */
const row = (cells: string[]) => `| ${cells.join(" | ")} |`;

const tickers = process.argv.slice(2);
if (!tickers.length) throw new Error("usage: price-impact.ts TICKER...");

console.log(`Quotes at ${new Date().toISOString()}. bps vs fair, + = worse for us.\n`);
const header = [
  "Ticker",
  "Provider",
  "Status",
  "Fair",
  ...SIZES.map((s) => `buy $${s}`),
  ...SIZES.map((s) => `sell $${s}`),
];
console.log(row(header));
console.log(row(header.map(() => "---")));

for (const { type, name } of PROVIDERS) {
  const list = await get<Listed[]>(
    `/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=${type}`,
  );
  for (const ticker of tickers) {
    const token = list.find((t) => t.ticker === ticker && t.chainId === "56")?.contractAddress;
    if (!token) continue;
    const d = await get<Dynamic>(
      `/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=56&contractAddress=${token}`,
    );
    const fair = d.stockInfo.price
      ? Number(d.stockInfo.price) * Number(d.tokenInfo.sharesMultiplier)
      : Number(d.tokenInfo.price);
    const cells: string[] = [];
    const out = (from: string, to: string, qty: number) =>
      quote(from, to, qty.toFixed(8)).then(
        (q) => Number(q.toCoinAmount),
        () => null,
      );
    for (const usd of SIZES) {
      const got = await out(USDT, token, usd);
      cells.push(got === null ? "err" : bps(usd / got / fair - 1));
    }
    for (const usd of SIZES) {
      const got = await out(token, USDT, usd / fair);
      cells.push(got === null ? "err" : bps(1 - got / usd));
    }
    console.log(row([ticker, name, d.statusInfo.marketStatus ?? "-", fair.toFixed(2), ...cells]));
  }
}
