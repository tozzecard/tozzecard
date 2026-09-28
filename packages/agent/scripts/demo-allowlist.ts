// Demo (plan §8.6): the agent is asked to send USD1 somewhere other than the card, and Binance
// refuses because the address is not in the Agentic Wallet address book.
// Target is the agent's own address: not in the address book, and nothing is lost if it ever passed.
// Run: bun packages/agent/scripts/demo-allowlist.ts
import { BawError, cli, refill } from "../src";

const { addresses } = await cli.run<{ addresses: { binanceChainId: string; address: string }[] }>([
  "wallet",
  "address",
]);
const self = addresses.find((a) => a.binanceChainId === "56")?.address;
if (!self) throw new Error("no BSC address");

console.log(`Agent tries: send 0.01 USD1 → ${self} (not the card)`);
try {
  const tx = await refill(self, "0.01");
  console.log(`NOT BLOCKED, tx ${tx}. The allowlist is not holding: check the address book.`);
  process.exit(1);
} catch (e) {
  if (!(e instanceof BawError && e.code === 351703)) throw e;
  console.log(`Blocked by Binance (${e.code}): ${e.message}`);
}
