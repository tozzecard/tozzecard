// B402: Binance's x402 facilitator. Merchant-side calls only; the secret never reaches a browser.
// Docs: https://web3.binance.com/en/dev-docs/products/b402-api/integration-guide
import type { BinanceClient } from "./index";

export const B402_NETWORK = "eip155:56";

export interface B402Extra {
  name: string;
  version: string;
  assetTransferMethod: "eip3009" | "permit2-exact" | "permit2-upto";
  signerAddress: string;
  spenderAddress: string | null;
}

export interface B402Kind {
  x402Version: number;
  scheme: "exact" | "upto";
  network: string;
  extra: B402Extra;
}

export interface PaymentRequirements {
  scheme: "exact" | "upto";
  network: string;
  /** Smallest unit of the asset, decimal string. */
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: B402Extra;
}

export interface Eip3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface PaymentPayload {
  x402Version: 2;
  resource: { url: string; description?: string; mimeType?: string };
  accepted: PaymentRequirements;
  // The integration guide nests authorization here; the API reference puts it next to payload.
  // We follow the guide (and x402 v2). Confirmed or corrected by live check L5.
  payload: { signature: string; authorization: Eip3009Authorization };
}

export interface VerifyResult {
  isValid: boolean;
  payer: string;
  invalidReason?: string | null;
  invalidMessage?: string | null;
}

export interface SettleResult {
  success: boolean;
  transaction: string;
  payer: string;
  network: string;
  amount: string;
  errorReason?: string | null;
  errorMessage?: string | null;
}

// Every B402 request body is wrapped in {"body": ...}.
const post = <T>(client: BinanceClient, op: string, body: unknown) =>
  client.post<T>(`/api/v2/b402/${op}`, { body });

export const b402Supported = (client: BinanceClient) =>
  post<{ kinds: B402Kind[] }>(client, "supported", {});

export const b402Verify = (
  client: BinanceClient,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
) => post<VerifyResult>(client, "verify", { x402Version: 2, paymentPayload, paymentRequirements });

export const b402Settle = (
  client: BinanceClient,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
) => post<SettleResult>(client, "settle", { x402Version: 2, paymentPayload, paymentRequirements });
