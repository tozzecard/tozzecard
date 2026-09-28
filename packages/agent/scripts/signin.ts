// Sign the Agentic Wallet in on this machine (the API server included: `railway ssh`, then run
// this). Prints the link + pairing code, then waits up to 5 min for the user to confirm in the
// Binance App. The session is stored under BINANCE_BAW_DIR (on Railway: the /data volume) and
// encrypted with BINANCE_INSTANCE_ID; without it baw uses the MAC address, which a container
// doesn't keep across deploys. Signing in here signs out any other baw session of this wallet.
// Run: bun packages/agent/scripts/signin.ts
import { cli, session } from "../src";

const before = await session();
if (before.connected) {
  console.log("Already signed in:", before);
  process.exit(0);
}
const { urlForWeb, pairingCode, qrCodeId } = await cli.run<{
  urlForWeb: string;
  pairingCode: string;
  qrCodeId: string;
}>(["auth", "signin"]);
console.log(
  `Open ${urlForWeb}\nIn the Binance App, check the pairing code is ${pairingCode} and confirm.`,
);
await cli.run(["auth", "verify", "--qrCodeId", qrCodeId]);
console.log("Signed in:", await session());
