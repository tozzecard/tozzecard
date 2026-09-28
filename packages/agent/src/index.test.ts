import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cli, refill, swap, USDT } from ".";

const NVDA = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const settings = (enabled: boolean) => ({ devMode: { enabled } });

function fake(orders: string[], devMode = false) {
  const calls: string[][] = [];
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    calls.push(args);
    const cmd = args.slice(0, 2).join(" ");
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
  expect(calls.every((c) => c[1] === "settings")).toBe(true);
});
