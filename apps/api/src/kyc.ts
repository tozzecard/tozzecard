// Identity check with Didit (https://docs.didit.me): the card holder opens a hosted session,
// Didit calls /kyc/didit when it decides, and we read the document from the decision endpoint
// (not the webhook body) before card.ts issues the card.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IdentityDocument, Kyc } from "./card";

const BASE = "https://verification.didit.me/v3";
const WEBHOOK_TOLERANCE_S = 300;

export interface DiditConfig {
  apiKey: string;
  workflowId: string;
  webhookSecret: string;
  fetch?: typeof fetch;
}

/** Didit session status → our kyc state. Approved is handled apart (it needs the document). */
export function kycOf(status: string): Exclude<Kyc, "approved" | "duplicate"> {
  if (status === "Declined") return "declined";
  if (status === "Abandoned" || status === "Expired" || status === "Kyc Expired") return "none";
  return "pending";
}

export function createDidit(cfg: DiditConfig) {
  const f = cfg.fetch ?? fetch;
  const call = async (path: string, init?: RequestInit) => {
    const res = await f(`${BASE}${path}`, {
      ...init,
      headers: { "x-api-key": cfg.apiKey, "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`didit ${path}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  };

  /** A hosted verification session for this card; `callback` is where Didit sends the user back. */
  async function createSession(address: string, callback: string) {
    const r = await call("/session/", {
      method: "POST",
      // "both": Didit's done page otherwise frames the callback, which COEP blocks (#61).
      body: JSON.stringify({
        workflow_id: cfg.workflowId,
        vendor_data: address,
        callback,
        callback_method: "both",
      }),
    });
    return { sessionId: String(r.session_id), url: String(r.url) };
  }

  /** The approved identity document of a session, from Didit's decision endpoint. */
  async function approvedDocument(sessionId: string): Promise<IdentityDocument> {
    const d = await call(`/session/${encodeURIComponent(sessionId)}/decision/`);
    const ids = (d.id_verifications ?? []) as Record<string, string | undefined>[];
    const id = ids.find((v) => v.status === "Approved");
    if (!id?.document_number) throw new Error(`didit ${sessionId}: no approved id_verification`);
    return {
      fullName: id.full_name ?? `${id.first_name ?? ""} ${id.last_name ?? ""}`,
      issuingState: id.issuing_state ?? "",
      documentType: id.document_type ?? "",
      documentNumber: id.document_number,
    };
  }

  /** X-Signature: hex HMAC-SHA256 of the raw body; X-Timestamp within 5 minutes. */
  function verifyWebhook(
    raw: string,
    signature: string | undefined,
    timestamp: string | undefined,
    nowSec = Math.floor(Date.now() / 1000),
  ): boolean {
    if (!signature || !(Math.abs(nowSec - Number(timestamp)) <= WEBHOOK_TOLERANCE_S)) return false;
    const want = createHmac("sha256", cfg.webhookSecret).update(raw).digest();
    const got = Buffer.from(signature, "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  }

  return { createSession, approvedDocument, verifyWebhook };
}

export type Didit = ReturnType<typeof createDidit>;
