import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createDidit, kycOf } from "./kyc";

const cfg = { apiKey: "k", workflowId: "wf", webhookSecret: "whsec" };

test("webhook: HMAC of the raw body, fresh timestamp", () => {
  const didit = createDidit(cfg);
  const raw = '{"session_id":"s1","status":"Approved"}';
  const sig = createHmac("sha256", "whsec").update(raw).digest("hex");
  expect(didit.verifyWebhook(raw, sig, "1000", 1000)).toBe(true);
  expect(didit.verifyWebhook(raw, sig, "1000", 1301)).toBe(false);
  expect(didit.verifyWebhook(`${raw} `, sig, "1000", 1000)).toBe(false);
  expect(didit.verifyWebhook(raw, "00", "1000", 1000)).toBe(false);
  expect(didit.verifyWebhook(raw, undefined, "1000", 1000)).toBe(false);
  expect(didit.verifyWebhook(raw, sig, undefined, 1000)).toBe(false);
});

test("session and decision calls", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const body = url.endsWith("/decision/")
      ? {
          id_verifications: [
            { status: "Declined", document_number: "OLD" },
            {
              status: "Approved",
              full_name: "Carmen Española",
              issuing_state: "ESP",
              document_type: "Identity Card",
              document_number: "CAA000000",
            },
          ],
        }
      : { session_id: "s1", url: "https://verify.didit.me/session/abc" };
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const didit = createDidit({ ...cfg, fetch: fake });

  expect(await didit.createSession("0xabc", "https://app.tozzecard.xyz/")).toEqual({
    sessionId: "s1",
    url: "https://verify.didit.me/session/abc",
  });
  expect(calls[0][0]).toBe("https://verification.didit.me/v3/session/");
  expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
    workflow_id: "wf",
    vendor_data: "0xabc",
    callback: "https://app.tozzecard.xyz/",
  });
  expect(await didit.approvedDocument("s1")).toEqual({
    fullName: "Carmen Española",
    issuingState: "ESP",
    documentType: "Identity Card",
    documentNumber: "CAA000000",
  });
  expect(kycOf("Declined")).toBe("declined");
  expect(kycOf("Expired")).toBe("none");
  expect(kycOf("In Review")).toBe("pending");
});
