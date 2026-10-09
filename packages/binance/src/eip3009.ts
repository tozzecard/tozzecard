// Paying a B402 (x402 v2) requirement with an EIP-3009 token (USD1): what the card signs and
// sends. Browser-safe (no node: imports), so apps/web imports it as "@tozzecard/binance/eip3009".
//   const { authorization, typedData } = transferAuthorization(req, card.address);
//   const signature = await account.signTypedData(typedData);   // viem, passkey-unlocked key
//   fetch(payUrl, { method: "POST", headers: { "PAYMENT-SIGNATURE": paymentHeader(payUrl, req, authorization, signature) } });
import type { Eip3009Authorization, PaymentPayload, PaymentRequirements } from "./b402";

const BSC = 56;

export function transferAuthorization(
  req: PaymentRequirements,
  from: string,
  nowSec = Math.floor(Date.now() / 1000),
) {
  const nonce = `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const authorization: Eip3009Authorization = {
    from,
    to: req.payTo,
    value: req.amount,
    validAfter: "0",
    validBefore: String(nowSec + req.maxTimeoutSeconds),
    nonce,
  };
  const typedData = {
    domain: {
      name: req.extra.name,
      version: req.extra.version,
      chainId: BSC,
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
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: from as `0x${string}`,
      to: req.payTo as `0x${string}`,
      value: BigInt(req.amount),
      validAfter: 0n,
      validBefore: BigInt(authorization.validBefore),
      nonce: nonce as `0x${string}`,
    },
  };
  return { authorization, typedData };
}

/** The PAYMENT-SIGNATURE header value: base64 of the x402 v2 payload. */
export function paymentHeader(
  url: string,
  req: PaymentRequirements,
  authorization: Eip3009Authorization,
  signature: string,
): string {
  const payload: PaymentPayload = {
    x402Version: 2,
    resource: { url },
    accepted: req,
    payload: { signature, authorization },
  };
  return btoa(JSON.stringify(payload));
}
