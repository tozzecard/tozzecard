import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  BawError,
  cli,
  planRebalance,
  rebalance,
  refill,
  sellForCard,
  session,
  swap,
  USD1,
  USDT,
} from ".";

const NVDA = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const settings = (enabled: boolean) => ({ devMode: { enabled } });

function fake(orders: string[], devMode = false) {
  const calls: string[][] = [];
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    calls.push(args);
    const cmd = args.slice(0, 2).join(" ");
    if (cmd === "wallet status") return { status: "CONNECTED" };
    if (cmd === "wallet settings") return settings(devMode);
    if (cmd === "market-order quote") return { toCoinAmount: "0.022" };
    if (cmd === "market-order swap") return { orderId: "1" };
    if (cmd === "market-order list")
      return { list: [{ orderId: "1", status: orders.shift(), txHash: "0xabc" }] };
    if (cmd === "wallet send") return { txHash: "0xdef" };
    throw new Error(`unexpected ${cmd}`);
  }) as typeof cli.run);
  return calls;
}

afterEach(() => mock.restore());

test("swap polls until FINISHED", async () => {
  const calls = fake(["PENDING", "PENDING", "FINISHED"]);
  const r = await swap(USDT, NVDA, "5", "1", 0);
  expect(r.order.status).toBe("FINISHED");
  expect(calls.filter((c) => c[1] === "list")).toHaveLength(3);
});

test("swap throws on FAILED instead of reporting success", async () => {
  fake(["PENDING", "FAILED"]);
  expect(swap(USDT, NVDA, "5", "1", 0)).rejects.toThrow("FAILED");
});

test("swap gives up when order stays PENDING", async () => {
  fake(Array(100).fill("PENDING"));
  expect(swap(USDT, NVDA, "5", "1", 0, 0)).rejects.toThrow("PENDING");
});

test("nothing executes while Developer Mode is on", async () => {
  const calls = fake([], true);
  expect(refill("0xcard", "5")).rejects.toThrow("Developer Mode");
  expect(swap(USDT, NVDA, "5")).rejects.toThrow("Developer Mode");
  await Bun.sleep(0);
  expect(calls.every((c) => c[0] === "wallet" && c[1] !== "send")).toBe(true);
});

test("signed-out session is a clear error, before anything else runs", async () => {
  spyOn(cli, "run").mockResolvedValue({ status: "UNCONNECTED" } as never);
  expect(refill("0xcard", "5")).rejects.toMatchObject({ name: "SESSION_EXPIRED" });
});

test("sellForCard: Ondo falls back to token → USDT → USD1", async () => {
  const swaps: string[] = [];
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    const cmd = args.slice(0, 2).join(" ");
    const to = args[args.indexOf("--toToken") + 1];
    if (cmd === "wallet status") return { status: "CONNECTED" };
    if (cmd === "wallet settings") return settings(false);
    if (cmd === "market-order quote") {
      if (args.includes(NVDA) && to === USD1)
        throw new BawError(103, "SERVICE_ERROR", "Unsupported token pair for Ondo trading");
      return {};
    }
    if (cmd === "market-order swap") {
      swaps.push(to);
      return { orderId: String(swaps.length) };
    }
    if (cmd === "market-order list")
      return {
        list: [{ orderId: String(swaps.length), status: "FINISHED", toTokenActualQty: "5.01" }],
      };
    throw new Error(`unexpected ${cmd}`);
  }) as typeof cli.run);
  const r = await sellForCard(NVDA, "0.0223");
  expect(swaps).toEqual([USDT, USD1]);
  expect(r).toHaveLength(2);
});

test("swap finds the order when baw returns a different orderId (first-use approval)", async () => {
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    const cmd = args.slice(0, 2).join(" ");
    if (cmd === "wallet status") return { status: "CONNECTED" };
    if (cmd === "wallet settings") return settings(false);
    if (cmd === "market-order quote") return {};
    if (cmd === "market-order swap") return { orderId: "6867" };
    if (cmd === "market-order list") return { list: [{ orderId: "6868", status: "FINISHED" }] };
    throw new Error(`unexpected ${cmd}`);
  }) as typeof cli.run);
  const r = await swap(USD1, NVDA, "5.1", "1", 0);
  expect(r.order.orderId).toBe("6868");
});

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const h = (address: string, value: number, price = 1) => ({
  symbol: "",
  address,
  balance: String(value / price),
  price: String(price),
  value: String(value),
});

test("planRebalance: no trades inside drift", () => {
  expect(
    planRebalance([h(NVDA, 52, 230), h(NVDAB, 48, 227)], { [NVDA]: 0.5, [NVDAB]: 0.5 }),
  ).toEqual([]);
});

test("planRebalance: sells overweight before buying underweight, in token units", () => {
  const t = planRebalance([h(NVDA, 70, 230), h(NVDAB, 30, 227)], { [NVDA]: 0.5, [NVDAB]: 0.5 });
  expect(t.map((x) => [x.side, x.token, x.usd])).toEqual([
    ["sell", NVDA, 20],
    ["buy", NVDAB, 20],
  ]);
  expect(t[0].qty).toBe((20 / 230).toFixed(8));
});

test("planRebalance: idle USDT gets deployed, sub-$5 legs skipped", () => {
  const t = planRebalance([h(USDT, 30), h(NVDA, 50, 230), h(NVDAB, 23, 227)], {
    [NVDA]: 0.5,
    [NVDAB]: 0.5,
  });
  // total 103 → 51.5 each: NVDA +1.5 (skipped), NVDAB +28.5
  expect(t).toEqual([{ token: NVDAB, side: "buy", usd: 28.5, qty: "28.500000" }]);
});

test("rebalance scales buys down to the USDT the sells actually returned", async () => {
  const calls: string[][] = [];
  let balanceReads = 0;
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    calls.push(args);
    const cmd = args.slice(0, 2).join(" ");
    if (cmd === "wallet balance")
      return balanceReads++ === 0 ? [h(NVDA, 70, 230), h(NVDAB, 30, 227)] : [h(USDT, 19)];
    if (cmd === "wallet status") return { status: "CONNECTED" };
    if (cmd === "wallet settings") return settings(false);
    if (cmd === "market-order quote") return {};
    if (cmd === "market-order swap") return { orderId: "1" };
    if (cmd === "market-order list") return { list: [{ orderId: "1", status: "FINISHED" }] };
    throw new Error(`unexpected ${cmd}`);
  }) as typeof cli.run);
  const r = await rebalance({ [NVDA]: 0.5, [NVDAB]: 0.5 });
  expect(r.map((x) => [x.trade.side, x.trade.qty])).toEqual([
    ["sell", (20 / 230).toFixed(8)],
    ["buy", "19.000000"],
  ]);
});

test("session reports expiry times and Developer Mode; signed out → connected: false", async () => {
  const run = spyOn(cli, "run").mockImplementation((async (args: string[]) =>
    args[1] === "status"
      ? { status: "CONNECTED" }
      : {
          devMode: { enabled: false },
          sessionExpireTime: "2026-09-30T18:34:05+07:00",
          signInMaxTime: "2026-10-05T18:34:05+07:00",
          quotaLeft: 49990,
        }) as typeof cli.run);
  expect(await session()).toEqual({
    connected: true,
    devMode: false,
    sessionExpireTime: "2026-09-30T18:34:05+07:00",
    signInMaxTime: "2026-10-05T18:34:05+07:00",
    quotaLeft: 49990,
  });
  run.mockResolvedValue({ status: "UNCONNECTED" } as never);
  expect(await session()).toEqual({ connected: false });
});

test("swap ignores an older order of the same pair (failed attempt before a retry)", async () => {
  const lists = [
    [{ orderId: "5", status: "FAILED" }],
    [
      { orderId: "6", status: "FINISHED" },
      { orderId: "5", status: "FAILED" },
    ],
  ];
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    const cmd = args.slice(0, 2).join(" ");
    if (cmd === "wallet status") return { status: "CONNECTED" };
    if (cmd === "wallet settings") return settings(false);
    if (cmd === "market-order quote") return {};
    if (cmd === "market-order swap") return { orderId: "6" };
    if (cmd === "market-order list") return { list: lists.shift() };
    throw new Error(`unexpected ${cmd}`);
  }) as typeof cli.run);
  const r = await swap(USDT, NVDA, "5", "1", 0);
  expect(r.order.orderId).toBe("6");
});

test("sellForCard: stops with a clear error when the USDT leg reports no amount", async () => {
  const swaps: string[] = [];
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    const cmd = args.slice(0, 2).join(" ");
    const to = args[args.indexOf("--toToken") + 1];
    if (cmd === "wallet status") return { status: "CONNECTED" };
    if (cmd === "wallet settings") return settings(false);
    if (cmd === "market-order quote") {
      if (to === USD1) throw new BawError(103, "SERVICE_ERROR", "Unsupported token pair");
      return {};
    }
    if (cmd === "market-order swap") {
      swaps.push(to);
      return { orderId: "1" };
    }
    if (cmd === "market-order list") return { list: [{ orderId: "1", status: "FINISHED" }] };
    throw new Error(`unexpected ${cmd}`);
  }) as typeof cli.run);
  expect(sellForCard(NVDA, "0.0223")).rejects.toThrow("no USDT amount");
  await Bun.sleep(0);
  expect(swaps).toEqual([USDT]); // never swapped "0" into USD1
});

test("planRebalance: a full exit never sells more than the balance", () => {
  // 0.123456789999 NVDA at 230: toFixed(8) would round up to 0.12345679
  const balance = 0.123456789999;
  const t = planRebalance(
    [
      {
        symbol: "",
        address: NVDA,
        balance: String(balance),
        price: "230",
        value: String(balance * 230),
      },
      h(NVDAB, 30, 227),
    ],
    { [NVDA]: 0, [NVDAB]: 1 },
  );
  const sell = t.find((x) => x.side === "sell");
  expect(Number(sell?.qty)).toBeLessThanOrEqual(balance);
  expect(sell?.qty).toBe("0.12345678");
});

test("cli.run kills a baw that never answers and throws TIMEOUT", async () => {
  const { bin, timeoutMs } = cli;
  cli.bin = ["bun", "-e", "await Bun.sleep(10_000)"];
  cli.timeoutMs = 200;
  try {
    const t = Date.now();
    const err = (await cli.run(["wallet", "status"]).catch((e) => e)) as BawError;
    expect(err.name).toBe("TIMEOUT");
    expect(Date.now() - t).toBeLessThan(2_000);
  } finally {
    Object.assign(cli, { bin, timeoutMs });
  }
});
