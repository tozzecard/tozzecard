// Client for apps/api (https://api.tozzecard.xyz/docs). Types follow its OpenAPI spec; every number
// on screen comes from here or from the chain, never from the app.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.tozzecard.xyz").replace(
  /\/$/,
  "",
);

export interface Card {
  address: string;
  holder: string;
  /** Display only: prefix 9406, Luhn-valid, not a payment-network number. */
  number: string;
  /** MM/YY */
  expiry: string;
  cvv: string;
  createdAt: number;
}

/** Identity check (issue #50). Absent while the API has no KYC; the agent link gates instead. */
export type KycStatus = "none" | "pending" | "approved" | "declined" | "duplicate";

export interface Me {
  kyc?: KycStatus;
  /** Null until the card is issued, once the API gates issuing behind KYC (issue #50). */
  card: Card | null;
  balance: { usd1: number; bnb: number };
  agent: { linked: boolean; mode: "off" | "dry" | "live" };
}

export interface Activity {
  type: "payment" | "refill";
  at: number;
  /** Negative for payments, positive for refills. */
  usd: number;
  description: string;
  tx: string | null;
}

export interface MarketStatus {
  openState: boolean;
  marketStatus: string | null;
  reasonCode: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

export interface Market {
  symbol: string;
  address: string;
  platform: string;
  ticker: string;
  ratio: number;
  status: MarketStatus;
  tokenPrice: number;
  perShare: number;
  priceAt: number;
  closeRef: { perShare: number; at: number } | null;
  spreadVsClose: number | null;
}

export interface Holding {
  symbol: string;
  address: string;
  balance: string;
  valueUsd: number;
  weight: number;
  target: number;
  market: {
    ticker: string;
    platform: string;
    status: MarketStatus;
    tokenPrice: number;
    spreadVsClose: number | null;
  } | null;
}

export interface Portfolio {
  card: { address: string; usd1: number };
  totalUsd: number;
  holdings: Holding[];
}

export interface Decision {
  id: number;
  at: number;
  action: "none" | "refill" | "hold" | "rebalance";
  symbol: string | null;
  usd: number | null;
  /** Human-readable, shown as is. */
  reason: string;
  status: "logged" | "dry-run" | "executed" | "failed" | "unknown" | "blocked";
  txs: string[];
  error: string | null;
}

export interface AgentSession {
  connected: boolean;
  devMode: boolean;
  sessionExpireTime: string;
  signInMaxTime: string;
  quotaLeft: number;
}

/** `{error, code}` from the API, or a network failure. `status` 404 means the route is off. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!res.ok) throw new ApiError(data?.error ?? res.statusText, res.status, data?.code);
  return data as T;
}

export const bscscanTx = (hash: string) => `https://bscscan.com/tx/${hash}`;
