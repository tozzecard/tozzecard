import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import type { BinanceClient, PaymentPayload, PaymentRequirements } from "@tozzecard/binance";
import { paymentHeader, transferAuthorization } from "@tozzecard/binance/eip3009";
import { verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createMerchant, USD1 } from "./merchant";

const PAY_TO = "0x2222222222222222222222222222222222222222";
const EXTRA = {
  name: USD1.domainName,
  version: "1",
  assetTransferMethod: "eip3009" as const,
  signerAddress: "0x3333333333333333333333333333333333333333",
  spenderAddress: null,
};

// Fake B402: /supported offers USD1 (and a USDT kind to ignore); verify/settle are scripted.
let calls: string[];
let verifyValid: boolean;
let settleOk: boolean;
const client = {
  get: async () => {
    throw new Error("unused");
  },
  post: async (path: string) => {
    const op = path.split("/").pop() as string;
    calls.push(op);
    if (op === "supported")
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "eip155:56",
            extra: { ...EXTRA, name: "Tether USD", assetTransferMethod: "permit2-exact" },
          },
          { x402Version: 2, scheme: "exact", network: "eip155:56", extra: EXTRA },
        ],
      };
    if (op === "verify")
      return { isValid: verifyValid, payer: "0xpayer", invalidReason: "invalid_signature" };
    return settleOk
      ? { success: true, transaction: "0xtx", payer: "0xpayer", network: "eip155:56", amount: "1" }
      : { success: false, transaction: "", errorReason: "insufficient_funds" };
  },
} as unknown as BinanceClient;

let merchant: ReturnType<typeof createMerchant>;
beforeEach(() => {
  calls = [];
  verifyValid = true;
  settleOk = true;
  merchant = createMerchant({ client, db: new Database(":memory:"), payTo: PAY_TO });
});

const header = (accepted: PaymentRequirements) =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      resource: { url: "https://x" },
      accepted,
      payload: { signature: "0xsig", authorization: {} },
    } as PaymentPayload),
  ).toString("base64");

async function requirementsFor(id: string) {
  const r = await merchant.pay(id, undefined);
  if (r.status !== 402) throw new Error("expected 402");
  return r.body.accepts[0];
}

test("an unpaid order answers 402 with USD1 requirements built on the server", async () => {
  const order = merchant.create("2.5", "coffee");
  const reqs = await requirementsFor(order.id);
  expect(reqs).toEqual({
    scheme: "exact",
    network: "eip155:56",
    amount: "2500000000000000000",
    asset: USD1.address,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: EXTRA,
  });
});

test("a valid payment is verified, settled once, and the order is paid", async () => {
  const order = merchant.create("1", "coffee");
  const reqs = await requirementsFor(order.id);
  const r = await merchant.pay(order.id, header(reqs));
  expect(r.status).toBe(200);
  expect(r.status === 200 && r.order).toMatchObject({
    status: "paid",
    tx: "0xtx",
    payer: "0xpayer",
  });

  calls = [];
  expect((await merchant.pay(order.id, header(reqs))).status).toBe(200);
  expect(calls).toEqual([]); // already paid: no second settle
});

test("a buyer who changes the amount or payTo is rejected before B402 is called", async () => {
  const order = merchant.create("1", "coffee");
  const reqs = await requirementsFor(order.id);
  calls = [];
  for (const tampered of [
    { ...reqs, amount: "1" },
    { ...reqs, payTo: "0x9999999999999999999999999999999999999999" },
  ]) {
    const r = await merchant.pay(order.id, header(tampered));
    expect(r.status).toBe(402);
  }
  expect(calls.filter((c) => c !== "supported")).toEqual([]);
  expect(merchant.get(order.id)?.status).toBe("open");
});

test("an invalid signature stays unpaid with the facilitator's reason", async () => {
  verifyValid = false;
  const order = merchant.create("1", "coffee");
  const r = await merchant.pay(order.id, header(await requirementsFor(order.id)));
  expect(r).toMatchObject({ status: 402, body: { error: "invalid_signature" } });
  expect(merchant.get(order.id)?.status).toBe("open");
});

test("a failed settlement is a 502 and the order stays open", async () => {
  settleOk = false;
  const order = merchant.create("1", "coffee");
  const r = await merchant.pay(order.id, header(await requirementsFor(order.id)));
  expect(r).toMatchObject({ status: 502, body: { error: "insufficient_funds" } });
  expect(merchant.get(order.id)?.status).toBe("open");
});

test("unknown orders, garbage headers and non-positive amounts are refused", async () => {
  expect((await merchant.pay("nope", undefined)).status).toBe(404);
  const order = merchant.create("1", "coffee");
  expect((await merchant.pay(order.id, "%%%not-base64-json")).status).toBe(400);
  expect(() => merchant.create("0", "free")).toThrow();
});

test("the card's payload (eip3009 helper) is accepted, signed by the card, and lists its spends", async () => {
  const card = privateKeyToAccount(generatePrivateKey());
  const order = merchant.create("1.25", "coffee");
  const reqs = await requirementsFor(order.id);
  const { authorization, typedData } = transferAuthorization(reqs, card.address, 1_000);
  expect(authorization).toMatchObject({ to: PAY_TO, value: reqs.amount, validBefore: "1300" });
  const signature = await card.signTypedData(typedData);
  expect(await verifyTypedData({ ...typedData, address: card.address, signature })).toBe(true);

  const h = paymentHeader("https://x", reqs, authorization, signature);
  expect(JSON.parse(atob(h)).accepted).toEqual(reqs);
  expect((await merchant.pay(order.id, h)).status).toBe(200);
  expect(merchant.paidBy("0xPAYER").map((o) => o.id)).toEqual([order.id]);
  expect(merchant.spendsOf("0xpayer")[0].usd).toBe(1.25);
});
