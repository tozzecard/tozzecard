// L5: pay a merchant order the way the card will, from a wallet holding USD1 and no BNB.
// Run: PAYER_PRIVATE_KEY=0x... bun run --cwd apps/api pay <payUrl>
// The browser card (apps/web) does the same with a passkey-unlocked key.
import type { PaymentRequirements } from "@tozzecard/binance";
import { paymentHeader, transferAuthorization } from "@tozzecard/binance/eip3009";
import { privateKeyToAccount } from "viem/accounts";
import { PAYMENT_HEADER, RECEIPT_HEADER } from "../src/merchant";

const url = process.argv[2];
const key = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!url || !key) throw new Error("Usage: PAYER_PRIVATE_KEY=0x... pay <payUrl>");
const account = privateKeyToAccount(key);

const first = await fetch(url);
if (first.status !== 402)
  throw new Error(`expected 402, got ${first.status}: ${await first.text()}`);
const { accepts } = (await first.json()) as { accepts: PaymentRequirements[] };
const req = accepts[0];
console.log(
  `paying ${req.amount} (smallest unit) of ${req.asset} to ${req.payTo} as ${account.address}`,
);

const { authorization, typedData } = transferAuthorization(req, account.address);
const signature = await account.signTypedData(typedData);

const res = await fetch(url, {
  method: "POST",
  headers: { [PAYMENT_HEADER]: paymentHeader(url, req, authorization, signature) },
});
console.log(res.status, await res.json());
const receipt = res.headers.get(RECEIPT_HEADER);
if (receipt) console.log("receipt:", Buffer.from(receipt, "base64").toString());
