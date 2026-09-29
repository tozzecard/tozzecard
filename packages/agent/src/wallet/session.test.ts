import { afterEach, expect, mock, test } from "bun:test";
import { fakeBaw } from "../testing/fake-baw";
import { assertSafe, session } from "./session";

afterEach(() => mock.restore());

test("session reports expiry times, Developer Mode and quota", async () => {
  fakeBaw({
    "wallet settings": () => ({
      devMode: { enabled: false },
      sessionExpireTime: "2026-09-30T18:34:05+07:00",
      signInMaxTime: "2026-10-01T18:34:05+07:00",
      quotaLeft: 49990,
    }),
  });
  expect(await session()).toEqual({
    connected: true,
    devMode: false,
    sessionExpireTime: "2026-09-30T18:34:05+07:00",
    signInMaxTime: "2026-10-01T18:34:05+07:00",
    quotaLeft: 49990,
  });
});

test("signed out: session says so, assertSafe throws SESSION_EXPIRED", async () => {
  fakeBaw({ "wallet status": () => ({ status: "UNCONNECTED" }) });
  expect(await session()).toEqual({ connected: false });
  await expect(assertSafe()).rejects.toMatchObject({ name: "SESSION_EXPIRED" });
});

test("Developer Mode on: assertSafe refuses", async () => {
  fakeBaw({ "wallet settings": () => ({ devMode: { enabled: true } }) });
  await expect(assertSafe()).rejects.toThrow("Developer Mode");
});
