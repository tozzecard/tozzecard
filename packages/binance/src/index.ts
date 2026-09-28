// Binance Web3 API client, shared by apps/api and packages/agent.
// Owner: Kiel. Auth spec: https://web3.binance.com/en/dev-docs/authentication
import { createHmac } from "node:crypto";

export const BSC_CHAIN_ID = "56";
export const BASE_URL = "https://web3.binance.com";
// Must be in both the URL and the signed path, or the API answers 40102.
const PREFIX = "/build";

/** Market status values returned in RWA Data `statusInfo.marketStatus`. */
export type MarketStatus =
  | "premarket"
  | "regular"
  | "postmarket"
  | "overnight"
  | "closed"
  | "pause";

export type Query = Record<string, string | number | boolean | undefined>;

export class BinanceApiError extends Error {
  constructor(
    readonly code: number | string,
    message: string,
    readonly status: number,
  ) {
    super(`Binance Web3 API ${code}: ${message}`);
  }
}

// Spaces must be %20 like the docs' example; URLSearchParams would write "+".
export function queryString(query: Query = {}): string {
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function preHash(timestamp: string, method: string, requestPath: string, body = ""): string {
  return timestamp + method.toUpperCase() + requestPath + body;
}

export function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

export interface ClientOptions {
  apiKey: string;
  secret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createClient({
  apiKey,
  secret,
  baseUrl = BASE_URL,
  fetch: f = fetch,
}: ClientOptions) {
  async function request<T>(method: "GET" | "POST", path: string, query?: Query, body?: unknown) {
    const requestPath = PREFIX + path + queryString(query);
    const raw = body === undefined ? "" : JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const res = await f(baseUrl + requestPath, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-OC-APIKEY": apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": sign(secret, preHash(timestamp, method, requestPath, raw)),
      },
      body: raw || undefined,
    });
    const text = await res.text();
    let json: { code?: number | string; msg?: string; data?: T; success?: boolean };
    try {
      json = JSON.parse(text);
    } catch {
      throw new BinanceApiError("NON_JSON", text.slice(0, 200), res.status);
    }
    if (!res.ok || json.success === false || (json.code !== undefined && Number(json.code) !== 0)) {
      throw new BinanceApiError(json.code ?? res.status, json.msg ?? res.statusText, res.status);
    }
    return json.data as T;
  }

  return {
    get: <T>(path: string, query?: Query) => request<T>("GET", path, query),
    post: <T>(path: string, body: unknown, query?: Query) => request<T>("POST", path, query, body),
  };
}

export type BinanceClient = ReturnType<typeof createClient>;

export function clientFromEnv(env = process.env): BinanceClient {
  const apiKey = env.BINANCE_WEB3_API_KEY;
  const secret = env.BINANCE_WEB3_API_SECRET;
  if (!apiKey || !secret) {
    throw new Error("Set BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET (see .env.example)");
  }
  return createClient({ apiKey, secret });
}
