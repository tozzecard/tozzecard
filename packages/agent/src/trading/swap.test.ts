import { afterEach, expect, mock, test } from "bun:test";
import { BawError } from "../baw/cli";
import { USD1, USDT } from "../constants";
import { arg, fakeBaw, NVDA } from "../testing/fake-baw";
import { sellForCard, swap } from "./swap";

afterEach(() => mock.restore());

/** baw returns `orderId`, then `market-order list` answers with each entry of `lists` in turn. */
function fakeOrders(orderId: string, lists: { orderId: string; status: string }[][]) {
  return fakeBaw({
    "market-order swap": () => ({ orderId }),
    "market-order list": () => ({ list: lists.shift() ?? [] }),
  });
}

test("polls until FINISHED", async () => {
  const calls = fakeOrders("1", [
    [{ orderId: "1", status: "PENDING" }],
    [{ orderId: "1", status: "PENDING" }],
    [{ orderId: "1", status: "FINISHED" }],
  ]);
  const r = await swap(USDT, NVDA, "5", "1", 0);
  expect(r.order.status).toBe("FINISHED");
  expect(calls.filter((c) => c[1] === "list")).toHaveLength(3);
});

test("throws on FAILED instead of reporting success", async () => {
  fakeOrders("1", [[{ orderId: "1", status: "PENDING" }], [{ orderId: "1", status: "FAILED" }]]);
  await expect(swap(USDT, NVDA, "5", "1", 0)).rejects.toThrow("FAILED");
});

test("gives up when the order stays PENDING", async () => {
  fakeOrders(
    "1",
    Array.from({ length: 100 }, () => [{ orderId: "1", status: "PENDING" }]),
  );
  await expect(swap(USDT, NVDA, "5", "1", 0, 0)).rejects.toThrow("PENDING");
});

test("no order is placed while Developer Mode is on", async () => {
  const calls = fakeBaw({ "wallet settings": () => ({ devMode: { enabled: true } }) });
  await expect(swap(USDT, NVDA, "5")).rejects.toThrow("Developer Mode");
  expect(calls.every((c) => c[0] === "wallet")).toBe(true);
});

test("finds the order when baw returns a different orderId (first-use approval, N → N+1)", async () => {
  fakeOrders("6867", [[{ orderId: "6868", status: "FINISHED" }]]);
  const r = await swap(USD1, NVDA, "5.1", "1", 0);
  expect(r.order.orderId).toBe("6868");
});

test("ignores an older order of the same pair (a retry must not end on the old FAILED)", async () => {
  fakeOrders("6", [
    [{ orderId: "5", status: "FAILED" }],
    [
      { orderId: "6", status: "FINISHED" },
      { orderId: "5", status: "FAILED" },
    ],
  ]);
  const r = await swap(USDT, NVDA, "5", "1", 0);
  expect(r.order.orderId).toBe("6");
});

/** Ondo can't quote into USD1 (`103`), so sellForCard has to go through USDT. */
function fakeOndo(toTokenActualQty?: string) {
  const swaps: string[] = [];
  fakeBaw({
    "market-order quote": (args) => {
      if (arg(args, "--fromToken") === NVDA && arg(args, "--toToken") === USD1)
        throw new BawError(103, "SERVICE_ERROR", "Unsupported token pair for Ondo trading");
      return {};
    },
    "market-order swap": (args) => {
      swaps.push(arg(args, "--toToken"));
      return { orderId: String(swaps.length) };
    },
    "market-order list": () => ({
      list: [{ orderId: String(swaps.length), status: "FINISHED", toTokenActualQty }],
    }),
  });
  return swaps;
}

test("sellForCard: Ondo goes token → USDT → USD1", async () => {
  const swaps = fakeOndo("5.01");
  expect(await sellForCard(NVDA, "0.0223")).toHaveLength(2);
  expect(swaps).toEqual([USDT, USD1]);
});

test("sellForCard: stops with a clear error when the USDT leg reports no amount", async () => {
  const swaps = fakeOndo(undefined);
  await expect(sellForCard(NVDA, "0.0223")).rejects.toThrow("no USDT amount");
  expect(swaps).toEqual([USDT]); // never swapped "0" into USD1
});
