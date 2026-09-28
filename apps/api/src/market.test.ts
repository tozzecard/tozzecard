import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { BinanceClient, MarketStatus } from "@tozzecard/binance";
import { createMarket, spread } from "./market";

const ADDR = "0xAbC0000000000000000000000000000000000001";
const SPY = "0x0000000000000000000000000000000000000002";
const BSTOCK = "0x0000000000000000000000000000000000000003";

// Fake API: one token whose status and price we control.
function fakeClient(state: { status: MarketStatus; tokenPrice: number; ratio: number }) {
  const status = () => ({
    openState: state.status === "regular",
    marketStatus: state.status,
    reasonCode: null,
    nextOpenTime: null,
    nextCloseTime: null,
  });
  return {
    get: async (path: string) => {
      const statusInfo = status();
      if (path.endsWith("/rwa/tokens"))
        return [
          { tokenContractAddress: SPY, tokenSymbol: "SPYon", tokenToShareRatio: "1", statusInfo },
          {
            tokenContractAddress: BSTOCK,
            tokenSymbol: "NVDAB",
            tokenToShareRatio: "1",
            statusInfo: { ...statusInfo, marketStatus: null, openState: true },
          },
          {
            tokenContractAddress: ADDR,
            tokenSymbol: "NVDAon",
            platformId: "ondo",
            underlyingTicker: "NVDA",
            decimals: "18",
            tokenToShareRatio: String(state.ratio),
            statusInfo,
          },
        ];
      return [
        {
          tokenContractAddress: ADDR.toLowerCase(),
          tokenPrice: String(state.tokenPrice),
          referencePrice: String(state.tokenPrice / state.ratio),
          tokenPriceUpdatedAt: 0,
        },
        {
          tokenContractAddress: SPY,
          tokenPrice: "600",
          referencePrice: "600",
          tokenPriceUpdatedAt: 0,
        },
        {
          tokenContractAddress: BSTOCK,
          tokenPrice: "50",
          referencePrice: "50",
          tokenPriceUpdatedAt: 0,
        },
      ];
    },
    post: async () => {
      throw new Error("unused");
    },
  } as unknown as BinanceClient;
}

test("close reference follows the regular session, then freezes", async () => {
  const state = { status: "regular" as MarketStatus, tokenPrice: 200, ratio: 2 };
  const db = new Database(":memory:");
  const market = createMarket(fakeClient(state), db);

  await market.poll(1);
  state.tokenPrice = 210;
  await market.poll(2);
  expect(market.get("NVDAon")?.closeRef).toEqual({ perShare: 105, at: 2 });
  expect(market.get("NVDAon")?.spreadVsClose).toBe(0);

  // Market closes; on-chain keeps moving, reference stays at the close.
  state.status = "closed";
  state.tokenPrice = 189;
  await market.poll(3);
  const v = market.get("NVDAon");
  expect(v?.closeRef).toEqual({ perShare: 105, at: 2 });
  expect(v?.spreadVsClose).toBeCloseTo(-0.1);

  // A restart keeps the reference (same db).
  const again = createMarket(fakeClient(state), db);
  await again.poll(4);
  expect(again.get("NVDAon")?.closeRef).toEqual({ perShare: 105, at: 2 });
});

test("no reference until a regular session has been seen", async () => {
  const market = createMarket(
    fakeClient({ status: "closed", tokenPrice: 100, ratio: 1 }),
    new Database(":memory:"),
  );
  await market.poll(1);
  expect(market.get("NVDAon")?.closeRef).toBeNull();
  expect(market.get("NVDAon")?.spreadVsClose).toBeNull();
});

test("spread compares token price with the close per-share price times the ratio", () => {
  expect(spread(99, 0.5, { perShare: 200, at: 0 })).toBeCloseTo(-0.01);
  expect(spread(99, 0.5, null)).toBeNull();
});

test("a bStock without its own status borrows the benchmark's and still gets a close reference", async () => {
  const state = { status: "regular" as MarketStatus, tokenPrice: 100, ratio: 1 };
  const market = createMarket(fakeClient(state), new Database(":memory:"));
  await market.poll(1);
  const b = market.get("NVDAB");
  expect(b?.statusSource).toBe("benchmark");
  expect(b?.status.marketStatus).toBe("regular");
  expect(b?.closeRef).toEqual({ perShare: 50, at: 1 });
  expect(market.get("NVDAon")?.statusSource).toBe("token");
});
