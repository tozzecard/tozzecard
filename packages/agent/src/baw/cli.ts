// Runs the Binance `baw` CLI and turns its JSON envelope into a value or a BawError.

const BAW = require.resolve("@binance/agentic-wallet");

export class BawError extends Error {
  constructor(
    readonly code: number,
    readonly name: string,
    message: string,
  ) {
    super(message);
  }
}

export const cli = {
  // Node, not Bun: Bun can't create secp256k1 ECDH keys, which `auth signin` needs.
  bin: ["node", BAW],
  // baw never exits when signed out or when *.binance.com is unreachable (ISP DNS block), which
  // hung callers and leaked processes. Kill it and fail loudly instead.
  timeoutMs: 30_000,
  /** `timeoutMs` per call: `auth verify` legitimately waits up to 5 min for the Binance App. */
  async run<T>(args: string[], timeoutMs?: number): Promise<T> {
    const limit = timeoutMs ?? cli.timeoutMs;
    const proc = Bun.spawn([...cli.bin, ...args, "--json"], { stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, limit);
    const out =
      (await new Response(proc.stdout).text()) || (await new Response(proc.stderr).text());
    const code = await proc.exited;
    clearTimeout(timer);
    if (timedOut)
      throw new BawError(
        0,
        "TIMEOUT",
        `baw ${args.slice(0, 2).join(" ")} gave no answer in ${limit} ms (signed out, or *.binance.com unreachable)`,
      );
    let res: {
      success: boolean;
      data?: unknown;
      error?: { code: number; name: string; message: string };
    };
    try {
      res = JSON.parse(out);
    } catch {
      throw new Error(
        `baw ${args.slice(0, 2).join(" ")} exited ${code} with non-JSON output: ${out.slice(0, 200)}`,
      );
    }
    if (!res.success) {
      const e = res.error ?? { code, name: "UNKNOWN", message: out.slice(0, 200) };
      throw new BawError(e.code, e.name, e.message);
    }
    return res.data as T;
  },
};
