// OpenAPI 3.1 for the web app: served at /openapi.json, browsable at /docs (Swagger UI).
// ponytail: hand-written; keep it next to the routes in index.ts when one changes.

const json = (schema: object, description = "OK") => ({
  description,
  content: { "application/json": { schema } },
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const err = (description: string) => json(ref("Error"), description);
const body = (schema: object, example?: object) => ({
  required: true,
  content: { "application/json": { schema, ...(example ? { example } : {}) } },
});
const bearer = [{ bearer: [] }];
const num = { type: "number" };
const str = { type: "string" };
const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });
const agentOnly =
  "Exists only when the server runs with AGENT_MODE=dry|live (404 otherwise). 502 with code SESSION_EXPIRED / NOT_LOGGED_IN means the Agentic Wallet needs a sign-in in the Binance App.";

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Tozzecard API",
    version: "1.0.0",
    description: [
      "Backend for the Tozzecard app: card sign-in, card face and statement, agent strategy, portfolio, agent feed, market hours and the demo B402 merchant.",
      "",
      "**Sign in with the card key** (the EOA the browser unlocks with the passkey):",
      "1. `POST /auth/challenge {address}` → `{message}`",
      "2. `account.signMessage({ message })` (viem)",
      "3. `POST /auth/verify {message, signature, holder?}` → `{token, card}`. The first sign-in issues the card (201).",
      "4. Send `Authorization: Bearer <token>` on `/me*` and `PUT /strategy`. Tokens last 30 days.",
      "",
      "**Paying a merchant order** (B402 / x402 v2): `GET /merchant/orders/{id}/pay` → 402 with `accepts[0]`; build and sign with `@tozzecard/binance/eip3009` (`transferAuthorization`, `signTypedData`, `paymentHeader`); `POST` the same URL with header `PAYMENT-SIGNATURE`. The receipt comes back in `PAYMENT-RESPONSE`.",
      "",
      "Errors are `{error, code?}`. Amounts in USD are numbers; on-chain amounts are decimal strings.",
    ].join("\n"),
  },
  servers: [
    { url: "https://api.tozzecard.xyz", description: "VPS (BSC mainnet)" },
    { url: "http://localhost:8787", description: "Local" },
  ],
  tags: [
    { name: "Card", description: "Sign-in and the card itself" },
    { name: "Agent", description: "Strategy, portfolio and the agent's decisions" },
    { name: "Market", description: "US market hours and tokenized stock prices" },
    { name: "Merchant", description: "Demo merchant accepting USD1 through B402" },
    { name: "System" },
  ],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: str, code: str },
      },
      Card: {
        type: "object",
        description:
          "Card face. number and cvv identify the card in the app only (prefix 9406, Luhn-valid, not a payment-network number); payments are passkey-signed B402 authorizations.",
        properties: {
          address: { ...str, example: "0x0cA6De9ce4843846210Dec81C3f6032773376EAB" },
          holder: { ...str, example: "KIEL TAME" },
          number: { ...str, example: "9406472632795151" },
          expiry: { ...str, description: "MM/YY", example: "10/29" },
          cvv: { ...str, example: "775" },
          createdAt: { ...num, description: "ms since epoch" },
        },
      },
      Me: {
        type: "object",
        properties: {
          card: ref("Card"),
          balance: {
            type: "object",
            properties: {
              usd1: { ...num, description: "USD1 on BSC, spendable" },
              bnb: { ...num, description: "BNB on the card; B402 pays gas, so this stays 0" },
            },
          },
          agent: {
            type: "object",
            properties: {
              linked: {
                type: "boolean",
                description:
                  "This card is the one the server's Agentic Wallet refills (CARD_ADDRESS). False → show the address book setup step.",
              },
              mode: { enum: ["off", "dry", "live"] },
            },
          },
        },
      },
      Activity: {
        type: "object",
        properties: {
          type: { enum: ["payment", "refill"] },
          at: { ...num, description: "ms since epoch" },
          usd: { ...num, description: "negative for payments, positive for refills" },
          description: str,
          tx: { ...nullable(str), description: "BSC tx hash (BscScan)" },
        },
      },
      Strategy: {
        type: "object",
        properties: {
          targets: {
            type: "object",
            additionalProperties: num,
            description: "token address (lowercase) → weight, summing to 1",
          },
          weeklyEstimateUsd: num,
          tokens: {
            type: "array",
            items: {
              type: "object",
              properties: { address: str, symbol: nullable(str), weight: num },
            },
          },
        },
      },
      MarketStatus: {
        type: "object",
        properties: {
          openState: { type: "boolean" },
          marketStatus: nullable({
            enum: [
              "premarket",
              "regular",
              "postmarket",
              "overnight",
              "closed",
              "offhours",
              "pause",
              "paused",
            ],
          }),
          reasonCode: nullable(str),
          nextOpenTime: { ...nullable(num), description: "ms since epoch" },
          nextCloseTime: { ...nullable(num), description: "ms since epoch" },
        },
      },
      Market: {
        type: "object",
        properties: {
          symbol: { ...str, example: "NVDAon" },
          address: str,
          platform: { ...str, description: "issuer platform id (Ondo, bStocks)" },
          ticker: { ...str, example: "NVDA" },
          ratio: { ...num, description: "shares per token" },
          status: ref("MarketStatus"),
          statusSource: {
            enum: ["token", "benchmark"],
            description: "benchmark = borrowed from SPYon (bStocks have no status)",
          },
          tokenPrice: { ...num, description: "on-chain price per token, USD" },
          perShare: num,
          priceAt: num,
          closeRef: nullable({
            type: "object",
            properties: { perShare: num, at: num },
            description: "last regular-session price per share (our close reference)",
          }),
          spreadVsClose: {
            ...nullable(num),
            description: "token price vs close reference; 0.032 = 3.2% above",
          },
        },
      },
      Portfolio: {
        type: "object",
        properties: {
          card: { type: "object", properties: { address: str, usd1: num } },
          totalUsd: num,
          holdings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                symbol: str,
                address: str,
                balance: { ...str, description: "token units" },
                valueUsd: num,
                weight: { ...num, description: "share of totalUsd, 0–1" },
                target: { ...num, description: "strategy weight, 0–1" },
                market: nullable({
                  type: "object",
                  properties: {
                    ticker: str,
                    platform: str,
                    status: ref("MarketStatus"),
                    tokenPrice: num,
                    closeRef: nullable({ type: "object" }),
                    spreadVsClose: nullable(num),
                  },
                }),
              },
            },
          },
        },
      },
      Decision: {
        type: "object",
        properties: {
          id: { type: "integer" },
          at: num,
          action: { enum: ["none", "refill", "hold", "rebalance"] },
          symbol: nullable(str),
          usd: nullable(num),
          reason: { ...str, description: "human-readable, show as is in the feed" },
          status: { enum: ["logged", "dry-run", "executed", "failed", "unknown", "blocked"] },
          txs: { type: "array", items: str, description: "BSC tx hashes" },
          error: nullable(str),
        },
      },
      Session: {
        type: "object",
        properties: {
          connected: { type: "boolean" },
          devMode: { type: "boolean", description: "must be false, or the agent refuses to run" },
          sessionExpireTime: { ...str, description: "ISO; 48h idle" },
          signInMaxTime: { ...str, description: "ISO; hard re-sign-in deadline" },
          quotaLeft: { ...num, description: "USD left of today's daily limit" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: str,
          amount: { ...str, description: "USD1 smallest unit (18 decimals)" },
          description: str,
          status: { enum: ["open", "paid"] },
          payer: nullable(str),
          tx: nullable(str),
          createdAt: num,
        },
      },
      PaymentRequired: {
        type: "object",
        properties: {
          x402Version: { const: 2 },
          accepts: {
            type: "array",
            items: {
              type: "object",
              description:
                "PaymentRequirements: pass accepts[0] unchanged to transferAuthorization",
              properties: {
                scheme: { const: "exact" },
                network: { const: "eip155:56" },
                amount: str,
                asset: str,
                payTo: str,
                maxTimeoutSeconds: num,
                extra: { type: "object" },
              },
            },
          },
          error: str,
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Liveness and last market poll",
        responses: {
          200: json({
            type: "object",
            properties: { ok: { type: "boolean" }, marketPolledAt: nullable(num) },
          }),
        },
      },
    },
    "/auth/challenge": {
      post: {
        tags: ["Card"],
        summary: "One-time message for the card key to sign (valid 5 min)",
        requestBody: body(
          { type: "object", required: ["address"], properties: { address: str } },
          { address: "0x0cA6De9ce4843846210Dec81C3f6032773376EAB" },
        ),
        responses: {
          200: json({ type: "object", properties: { message: str } }),
          400: err("Not an address"),
        },
      },
    },
    "/auth/verify": {
      post: {
        tags: ["Card"],
        summary: "Signed message → bearer token; the first sign-in issues the card",
        requestBody: body(
          {
            type: "object",
            required: ["message", "signature"],
            properties: {
              message: { ...str, description: "exactly as /auth/challenge returned it" },
              signature: { ...str, description: "EIP-191 personal_sign by the card key" },
              holder: {
                ...str,
                description: "name on a new card; letters, spaces, . ' - up to 26 (uppercased)",
              },
            },
          },
          { message: "Sign in to Tozzecard\n...", signature: "0x...", holder: "Kiel Tame" },
        ),
        responses: {
          200: json(
            {
              type: "object",
              properties: { token: str, card: ref("Card"), created: { const: false } },
            },
            "Signed in to an existing card",
          ),
          201: json(
            {
              type: "object",
              properties: { token: str, card: ref("Card"), created: { const: true } },
            },
            "Card issued",
          ),
          400: err("message and signature are required"),
          401: err("Unknown, used or expired message, or not signed by the card key"),
        },
      },
    },
    "/auth/signout": {
      post: {
        tags: ["Card"],
        summary: "End the session",
        security: bearer,
        responses: { 204: { description: "Signed out" } },
      },
    },
    "/me": {
      get: {
        tags: ["Card"],
        summary: "Card face, balance, agent link",
        security: bearer,
        responses: { 200: json(ref("Me")), 401: err("Sign in first (code UNAUTHORIZED)") },
      },
      patch: {
        tags: ["Card"],
        summary: "Rename the card holder",
        security: bearer,
        requestBody: body(
          { type: "object", required: ["holder"], properties: { holder: str } },
          { holder: "Axel" },
        ),
        responses: {
          200: json({ type: "object", properties: { card: ref("Card") } }),
          400: err("Invalid name"),
          401: err("Sign in first"),
        },
      },
    },
    "/me/activity": {
      get: {
        tags: ["Card"],
        summary: "Card statement: B402 payments and agent refills, newest first",
        security: bearer,
        responses: {
          200: json({ type: "array", items: ref("Activity") }),
          401: err("Sign in first"),
        },
      },
    },
    "/strategy": {
      get: {
        tags: ["Agent"],
        summary: "The agent's target weights and weekly spend estimate",
        responses: { 200: json(ref("Strategy")) },
      },
      put: {
        tags: ["Agent"],
        summary: "Set the strategy (onboarding step 4). Only the agent's card",
        description:
          "Tokens by symbol (from /market) or address. Weights in (0, 1], summing to 1, max 10 tokens. The scheduler uses it from its next tick; in live mode a drift over 5% rebalances on the next market day.",
        security: bearer,
        requestBody: body(
          {
            type: "object",
            required: ["targets", "weeklyEstimateUsd"],
            properties: {
              targets: { type: "object", additionalProperties: num },
              weeklyEstimateUsd: num,
            },
          },
          { targets: { NVDAon: 0.7, AAPLon: 0.3 }, weeklyEstimateUsd: 80 },
        ),
        responses: {
          200: json({
            type: "object",
            properties: {
              targets: { type: "object", additionalProperties: num },
              weeklyEstimateUsd: num,
            },
          }),
          400: err("Invalid strategy (message says why)"),
          401: err("Sign in first"),
          403: err("Not the card this agent refills"),
        },
      },
    },
    "/portfolio": {
      get: {
        tags: ["Agent"],
        summary: "Agent wallet holdings vs targets, with market data, plus the card's USD1",
        description: `${agentOnly} Runs baw: a few seconds per call.`,
        responses: { 200: json(ref("Portfolio")), 502: err("Agentic Wallet error") },
      },
    },
    "/agent/decisions": {
      get: {
        tags: ["Agent"],
        summary: "Agent feed (decision log), newest first",
        description: agentOnly,
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 50 } }],
        responses: { 200: json({ type: "array", items: ref("Decision") }) },
      },
    },
    "/agent/session": {
      get: {
        tags: ["Agent"],
        summary: "Agentic Wallet session: connected, Developer Mode, expiry, daily quota",
        description: agentOnly,
        responses: { 200: json(ref("Session")), 502: err("baw error") },
      },
    },
    "/agent/preview": {
      get: {
        tags: ["Agent"],
        summary: "What the agent would decide at a given time (demo time travel, never trades)",
        description: agentOnly,
        parameters: [
          {
            name: "at",
            in: "query",
            schema: { type: "string", format: "date-time" },
            example: "2026-10-09T19:40:00Z",
          },
        ],
        responses: {
          200: json({
            type: "object",
            properties: {
              at: num,
              mode: { enum: ["dry", "live"] },
              decision: {
                type: "object",
                properties: {
                  action: { enum: ["none", "refill", "hold"] },
                  reason: str,
                  usd: num,
                  symbol: str,
                  needUsd: num,
                  horizon: num,
                  spread: num,
                },
              },
            },
          }),
        },
      },
    },
    "/market": {
      get: {
        tags: ["Market"],
        summary: "Every tokenized stock: status, on-chain price, close reference, spread",
        responses: { 200: json({ type: "array", items: ref("Market") }) },
      },
    },
    "/market/{symbol}": {
      get: {
        tags: ["Market"],
        summary: "One token (SPYon is the market clock)",
        parameters: [{ name: "symbol", in: "path", required: true, schema: str, example: "SPYon" }],
        responses: { 200: json(ref("Market")), 404: err("Unknown symbol") },
      },
    },
    "/merchant/orders": {
      post: {
        tags: ["Merchant"],
        summary: "Create an order (demo merchant)",
        description: "Exists only when MERCHANT_PAY_TO is set (B402 approved).",
        requestBody: body(
          {
            type: "object",
            required: ["amount"],
            properties: { amount: { ...str, description: "USD, decimal" }, description: str },
          },
          { amount: "2.50", description: "Coffee" },
        ),
        responses: {
          201: json({
            allOf: [ref("Order"), { type: "object", properties: { amountUsd: str } }],
          }),
          400: err("Bad amount"),
        },
      },
    },
    "/merchant/orders/{id}": {
      get: {
        tags: ["Merchant"],
        summary: "Order status",
        parameters: [{ name: "id", in: "path", required: true, schema: str }],
        responses: { 200: json(ref("Order")), 404: err("Unknown order") },
      },
    },
    "/merchant/orders/{id}/pay": {
      get: {
        tags: ["Merchant"],
        summary: "Payment requirements (402) for an open order",
        parameters: [{ name: "id", in: "path", required: true, schema: str }],
        responses: {
          200: json(ref("Order"), "Already paid"),
          402: json(ref("PaymentRequired"), "Pay with accepts[0]"),
          404: err("Unknown order"),
        },
      },
      post: {
        tags: ["Merchant"],
        summary: "Pay with a signed EIP-3009 authorization",
        parameters: [
          { name: "id", in: "path", required: true, schema: str },
          {
            name: "PAYMENT-SIGNATURE",
            in: "header",
            required: true,
            schema: str,
            description: "paymentHeader(url, accepts[0], authorization, signature)",
          },
        ],
        responses: {
          200: {
            ...json(ref("Order"), "Paid; settled by B402"),
            headers: {
              "PAYMENT-RESPONSE": { schema: str, description: "base64 JSON {tx}" },
            },
          },
          400: err("Header is not base64 JSON"),
          402: json(ref("PaymentRequired"), "Rejected (error says why); re-sign"),
          502: err("B402 settle failed or unavailable"),
        },
      },
    },
  },
};

// Swagger UI from a pinned CDN build; no dependency in the bundle.
export const docsHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tozzecard API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
</head><body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#ui", persistAuthorization: true });</script>
</body></html>`;
