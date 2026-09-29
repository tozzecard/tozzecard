// Test-only helpers: a stubbed `baw` and fixtures. Not exported from the package.
import { spyOn } from "bun:test";
import { cli } from "../baw/cli";
import type { Holding } from "../portfolio/rebalance";

type Handler = (args: string[]) => unknown;

export const NVDA = "0xa9ee28c80f960b889dfbd1902055218cba016f75"; // Ondo
export const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436"; // bStock

/**
 * Stub `cli.run`: a signed-in wallet with Developer Mode off, plus per-command handlers keyed by
 * the first two args ("market-order swap"). A handler may throw to simulate a baw error.
 * Unknown commands fail the test. Returns every call's args. Undo with `mock.restore()`.
 */
export function fakeBaw(handlers: Record<string, Handler> = {}) {
  const calls: string[][] = [];
  const defaults: Record<string, Handler> = {
    "wallet status": () => ({ status: "CONNECTED" }),
    "wallet settings": () => ({ devMode: { enabled: false } }),
    "market-order quote": () => ({}),
  };
  spyOn(cli, "run").mockImplementation((async (args: string[]) => {
    calls.push(args);
    const cmd = args.slice(0, 2).join(" ");
    const handler = handlers[cmd] ?? defaults[cmd];
    if (!handler) throw new Error(`unexpected baw ${cmd}`);
    return handler(args);
  }) as typeof cli.run);
  return calls;
}

/** The value after `flag` in a baw arg list. */
export const arg = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

/** A wallet balance row worth `value` USD at `price`. */
export const holding = (address: string, value: number, price = 1): Holding => ({
  symbol: "",
  address,
  balance: String(value / price),
  price: String(price),
  value: String(value),
});
