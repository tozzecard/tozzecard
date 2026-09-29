import { expect, spyOn, test } from "bun:test";
import { type BawError, cli } from "./cli";

/** Swap the spawned binary for a script; restores it afterwards. */
async function withBin<T>(script: string, timeoutMs: number, fn: () => Promise<T>) {
  const saved = { bin: cli.bin, timeoutMs: cli.timeoutMs };
  Object.assign(cli, { bin: ["bun", "-e", script], timeoutMs });
  try {
    return await fn();
  } finally {
    Object.assign(cli, saved);
  }
}

test("non-JSON output becomes an error with the exit code and output", async () => {
  const spawn = spyOn(Bun, "spawn").mockReturnValue({
    stdout: new Response("npm WARN something broke").body,
    stderr: new Response("").body,
    exited: Promise.resolve(1),
    kill() {},
  } as never);
  try {
    await expect(cli.run(["wallet", "status"])).rejects.toThrow(
      "exited 1 with non-JSON output: npm WARN",
    );
  } finally {
    spawn.mockRestore();
  }
});

test("a baw that never answers is killed and throws TIMEOUT", async () => {
  await withBin("await Bun.sleep(10_000)", 200, async () => {
    const t = Date.now();
    const err = (await cli.run(["wallet", "status"]).catch((e) => e)) as BawError;
    expect(err.name).toBe("TIMEOUT");
    expect(Date.now() - t).toBeLessThan(2_000);
  });
});

test("a per-call timeout outlives the default (auth verify waits for the App)", async () => {
  const answerLate = 'await Bun.sleep(400); console.log(JSON.stringify({success:true,data:"ok"}))';
  await withBin(answerLate, 100, async () => {
    expect(await cli.run<string>(["auth", "verify"], 2_000)).toBe("ok");
  });
});
