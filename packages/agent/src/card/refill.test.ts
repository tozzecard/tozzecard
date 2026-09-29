import { afterEach, expect, mock, test } from "bun:test";
import { USD1 } from "../constants";
import { arg, fakeBaw } from "../testing/fake-baw";
import { refill } from "./refill";

afterEach(() => mock.restore());

test("refill sends USD1 to the card", async () => {
  const calls = fakeBaw({ "wallet send": () => ({ txHash: "0xdef" }) });
  expect(await refill("0xcard", "12.5")).toBe("0xdef");
  const send = calls.find((c) => c[1] === "send") ?? [];
  expect([arg(send, "--recipient"), arg(send, "--amount"), arg(send, "--tokenAddress")]).toEqual([
    "0xcard",
    "12.5",
    USD1,
  ]);
});

test("nothing is sent while Developer Mode is on", async () => {
  const calls = fakeBaw({ "wallet settings": () => ({ devMode: { enabled: true } }) });
  await expect(refill("0xcard", "5")).rejects.toThrow("Developer Mode");
  expect(calls.some((c) => c[1] === "send")).toBe(false);
});

test("nothing is sent when signed out", async () => {
  const calls = fakeBaw({ "wallet status": () => ({ status: "UNCONNECTED" }) });
  await expect(refill("0xcard", "5")).rejects.toMatchObject({ name: "SESSION_EXPIRED" });
  expect(calls.some((c) => c[1] === "send")).toBe(false);
});
