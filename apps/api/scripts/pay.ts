// L5: pay a merchant order the way the card will, from a wallet holding USD1 and no BNB.
// Run: PAYER_PRIVATE_KEY=0x... bun run --cwd apps/api pay <payUrl>
// The browser card (apps/web) does the same with a passkey-unlocked key.
import type { PaymentPayload, PaymentRequirements } from "@tozzecard/binance";
import { toHex } from "viem";
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

const authorization = {
  from: account.address,
  to: req.payTo,
  value: req.amount,
  validAfter: "0",
  validBefore: String(Math.floor(Date.now() / 1000) + req.maxTimeoutSeconds),
  nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
};

const signature = await account.signTypedData({
  domain: {
    name: req.extra.name,
    version: req.extra.version,
    chainId: 56,
    verifyingContract: req.asset as `0x${string}`,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    ...authorization,
    to: authorization.to as `0x${string}`,
    value: BigInt(authorization.value),
    validAfter: 0n,
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce,
  },
});

const payload: PaymentPayload = {
  x402Version: 2,
  resource: { url },
  accepted: req,
  payload: { signature, authorization },
};

const res = await fetch(url, {
  method: "POST",
  headers: { [PAYMENT_HEADER]: Buffer.from(JSON.stringify(payload)).toString("base64") },
});
console.log(res.status, await res.json());
const receipt = res.headers.get(RECEIPT_HEADER);
if (receipt) console.log("receipt:", Buffer.from(receipt, "base64").toString());
