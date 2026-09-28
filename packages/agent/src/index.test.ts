import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { BawError, cli, refill, sellForCard, swap, USD1, USDT } from ".";

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
      return { list: [{ status: "FINISHED", toTokenActualQty: "5.01" }] };
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
