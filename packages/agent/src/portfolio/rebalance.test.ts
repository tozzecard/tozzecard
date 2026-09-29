import { afterEach, expect, mock, test } from "bun:test";
import { USDT } from "../constants";
import { fakeBaw, holding, NVDA, NVDAB } from "../testing/fake-baw";
import { planRebalance, rebalance } from "./rebalance";

afterEach(() => mock.restore());

const half = { [NVDA]: 0.5, [NVDAB]: 0.5 };

test("no trades inside drift", () => {
  expect(planRebalance([holding(NVDA, 52, 230), holding(NVDAB, 48, 227)], half)).toEqual([]);
});

test("sells overweight before buying underweight, sells in token units", () => {
  const t = planRebalance([holding(NVDA, 70, 230), holding(NVDAB, 30, 227)], half);
  expect(t.map((x) => [x.side, x.token, x.usd])).toEqual([
    ["sell", NVDA, 20],
    ["buy", NVDAB, 20],
  ]);
  expect(t[0].qty).toBe((20 / 230).toFixed(8));
});

test("idle USDT gets deployed, legs under $5 are skipped", () => {
  const t = planRebalance(
    [holding(USDT, 30), holding(NVDA, 50, 230), holding(NVDAB, 23, 227)],
    half,
  );
  // total 103 → 51.5 each: NVDA +1.5 (skipped), NVDAB +28.5
  expect(t).toEqual([{ token: NVDAB, side: "buy", usd: 28.5, qty: "28.500000" }]);
});

test("a full exit (weight 0) sells the exact balance string, never more", () => {
  const balance = "0.123456789999"; // toFixed(8) would round up to 0.12345679
  const nvda = { ...holding(NVDA, 28.4, 230), balance };
  const t = planRebalance([nvda, holding(NVDAB, 30, 227)], { [NVDA]: 0, [NVDAB]: 1 });
  expect(t[0]).toMatchObject({ side: "sell", token: NVDA, qty: balance });
});

test("rebalance scales buys down to the USDT the sells actually returned", async () => {
  let balanceReads = 0;
  fakeBaw({
    "wallet balance": () =>
      balanceReads++ === 0
        ? [holding(NVDA, 70, 230), holding(NVDAB, 30, 227)]
        : [holding(USDT, 19)],
    "market-order swap": () => ({ orderId: "1" }),
    "market-order list": () => ({ list: [{ orderId: "1", status: "FINISHED" }] }),
  });
  const r = await rebalance(half);
  expect(r.map((x) => [x.trade.side, x.trade.qty])).toEqual([
    ["sell", (20 / 230).toFixed(8)],
    ["buy", "19.000000"],
  ]);
});
