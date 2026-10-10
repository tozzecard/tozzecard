# Developer Experience Report — Tozzecard (DRAFT)

> **Team-only draft, delete this box before submitting.** The rules say perfunctory or
> AI-generated reports are rejected. This is a skeleton of facts compiled from
> [`dx-notes.md`](dx-notes.md), our issues and PRs, with sources. Kiel rewrites every section in his own words,
> Fajar checks the AI stack section. `TODO` = something only we can answer. Keep every number and error
> string; cut anything we can't back up.

What we built: a non-custodial card. The user's Binance Agentic Wallet holds tokenized stocks (Ondo, bStocks)
and refills a passkey card wallet in USD1 while the US market is open; the card pays through B402. BSC mainnet,
real money, `baw` 1.10.0, Binance Web3 API (RWA Data, Trading, B402). 28 Sep – 11 Oct 2026, team of three,
working from Indonesia; API server in Kuala Lumpur.

Totals from our log: **52 notes, ~415 minutes lost**: AI stack 175, tokenized-stock data 105, docs 65,
API 50, onboarding 20.

---

## 1. Onboarding

- First authenticated call (`GET /build/api/v1/dex/market/rwa/platforms`) worked **on the first try, 282 ms**.
  `TODO Kiel: minutes from opening the docs to that call.`
- Where we got stuck:
  - **Signing.** `/en/dev-docs/authentication`, "PreHash Construction": the example encodes a space as `%20`.
    JS `URLSearchParams` writes `+`, which gives a different preHash. Not mentioned; we encode by hand.
  - **`llms.txt` / `llms-full.txt`** return an empty body to `curl` (HTTP 202, bot check). The files meant for
    agents can't be fetched by an agent's HTTP client. 10 min.
  - **B402 is a separate onboarding.** A normal key gets `40104 No permission: B402` (HTTP 403). Nothing in the
    first-key flow says B402 needs its own application, a new key, and a **write-once** `payTo`. The application
    also requires a website URL, so we needed a domain before we could test payments at all. 10 min.
    `TODO Kiel: date we applied for B402. Still no permission on 10 Oct, so the demo merchant never settled a real
    B402 payment (MERCHANT_PAY_TO unset).`
  - **Indonesian ISPs block `*.binance.com` by DNS**, even with 1.1.1.1 set. The same block surfaced as three
    different errors: `NETWORK_ERROR` "Connection refused" (baw, 28 Sep), `SSL_ERROR` "certificate has expired"
    `50001005` (baw, 29 Sep), `ERR_TLS_CERT_ALTNAME_INVALID` (Web3 API from Bun, 4 Oct). Each one reads like a
    Binance-side problem. WARP or a VPS outside the blocked region fixes it.
  - **`baw auth signin` fails under Bun**: `UNKNOWN_ERROR` "Failed to create key using named curve" (`1001001`),
    because baw calls `createECDH("secp256k1")`. Other commands work under Bun. The package declares no `engines`.
    30 min.

## 2. Documentation issues

| Page, section | Problem |
| --- | --- |
| `/en/dev-docs/authentication`, "PreHash Construction" | `%20` vs `+` encoding not called out (above). |
| rwa-data, market status values | Docs list `pause`; the API sends `paused` (32 Ondo tokens, `MARKET_PAUSED`). Weekend status is `offhours`, not listed at all. 61 Ondo tokens are `premarket` with reasonCode `UNSUPPORTED`, unexplained. |
| rwa-data, `GET .../rwa/price`, `tokenContractAddresses` "max 100" | 100 BSC addresses → **HTTP 414 URI Too Long**, empty body. 80 works (~3.5 KB URL). The documented maximum can't be used on a GET. 15 min. |
| trading-api, quote page | Minimum order of 5 USD not documented; we found it as `40375` (below, §3). Same for skills-hub `market-order.md`. |
| trading-api, quote vs swap parameters | Fee is `feePercent` + `feeSource` (FROM_TOKEN/TO_TOKEN) on the quote page, `fromTokenReferrerWalletAddress` / `toTokenReferrerWalletAddress` in the swap docs. Two naming schemes for one feature. |
| b402-api/integration-guide §2, §6 | Never names the HTTP header the buyer sends the signed payment in, or the one the merchant answers with. We used x402 v2's `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`. 15 min. |
| b402 API reference vs integration-guide | `authorization` sits next to `payload` in the reference's verify body, inside `payload` in the guide. The 402 response is a `WWW-Authenticate: x402 ...` header in one and a JSON body `{x402Version, accepts}` in the other. 20 min. |
| b402-api/payment-methods | USD1's EIP-712 domain isn't listed (on-chain `eip712Domain()`: "World Liberty Financial USD", version "1"). The docs point to `/supported`, which needs B402 permission, so it can't be checked before applying. 10 min. |
| skills-hub `send.md` + `wallet-setting.md` | "The recipient address **must** be in the address book" is only true while Developer Mode is off: `contract-call` bypasses it (§4). Not stated anywhere. |
| skills-hub `gas.md` | Who pays gas depends on the route (Ondo swaps relayed, 0 BNB; USDT→USD1 swaps and approvals sent by the agent wallet, ~0.0001 BNB). Not documented. 15 min. |

## 3. API pitfalls

- **One token, three prices, each off by a factor of `tokenToShareRatio`** (40 min, our worst). Checked against a
  ~$10 Trading API sell quote: `/rwa/price.tokenPrice` matches (≤0.23%). `/rwa/tokens.tokenPrice` = true × ratio
  (SOXSon, ratio 0.1017: 0.3536 vs 3.4773, −89.8%). `/rwa/underlying-market...referencePrice` = true ÷ ratio²
  (SOXSon 336.13 vs 34.19). Invisible on NVDA (ratio 1.0017), wrong on the **259 BSC tokens** whose ratio ≠ 1.
  Repro: `bun run --cwd packages/binance price-check SOXSon ECOon NVDAon`.
- **`referencePrice` is derived from the on-chain price.** For all 488 BSC tokens, `/tokens.tokenPrice` =
  `/tokens.referencePrice` × ratio exactly. The API alone can't show the on-chain vs underlying gap the track is
  about; we record our own close reference from the last regular-session price.
- **Errors with HTTP 200.** Quoting $0.35 returns `200 {"code":40375,"msg":"Minimum order amount is 5 USD."}`.
- **Inconsistent error envelope.** `{"msg":"API Key is required","data":"","code":40101}` has no `success` field
  (every success has `success: true`) and `data: ""` instead of `null`. A client checking `success === false` misses it.
- **Rate limit** `42900` after ~6 calls in under a second across *different* endpoints, while the docs say 5 RPS
  per endpoint.
- **B402 uses another envelope**: requests wrapped in `{"body": {...}}`, answers `{status, type, code: "000000000",
  errorData, data}` vs `{code: 0, msg, data, success}` everywhere else.
- **bStocks carry no market hours**: all 46 BSC bStock tokens return `marketStatus`, `nextOpenTime`,
  `nextCloseTime` = `null`. We borrow SPYon's status.
- **`rwa/platforms` and `rwa/tokens` disagree** (10 Oct). Platforms: BSC has Ondo 458 + bStock 91, and Ondo is on
  chains `1` (457) and `CT_501` (451). `rwa/tokens?binanceChainId=56` returns 488 (Ondo 442 + bStock 46), and for
  `1` and `CT_501`, the ids platforms itself returns, an empty list with no error. 10 min.
- Latency was never a problem: 282 ms (`rwa/platforms`), 330 ms (`rwa/tokens`, 488 tokens).

## 4. AI stack: Agentic Wallet + `baw` CLI

We used the **Agentic Wallet through the `baw` CLI** (1.10.0) as the agent's wallet, driven from our server, and the
skills-hub `binance-agentic-wallet` references as documentation only: we never installed or ran a Wallet Skill from an
AI agent. Every wallet action is our own code calling `baw` (`packages/agent`).

**What worked**
- **The address book is the security model.** `baw wallet send` to an address outside it fails server-side with
  `351703` "recipient address is not in your address book", even in Developer Mode. Because of this we wrote no
  smart contract: the agent can only ever pay the user's card.
- Swaps are real and settle on mainnet. Ondo swaps are relayed (tx `from` is a Binance relayer, agent pays 0 BNB);
  a plain USDT→USD1 swap is sent by the agent wallet and costs ~0.0001 BNB. Who pays gas is not documented. 15 min.
- `--json` on every command made it scriptable.

**What did not**
- **Developer Mode silently disables the allowlist.** `contract-call execute USDT.transfer(...)` to a
  non-address-book address broadcast and succeeded
  (`0xb315357fd7f16cbc23f4ca0aede0aa76ff763a1f2176fe20fc63cc7ff1fe751a`). `contract-call preview` reports no risk.
  Our agent refuses to run when Developer Mode is on.
- **`swap` can return the wrong orderId.** First USD1 swap: `swap` returned `…6867`, the order that ran was `…6868`
  (FINISHED, `0x306caa7c…0dfc`). `list --orderId …6867` stays empty forever, so polling by the returned id reports
  a stuck swap that succeeded. 20 min. Right after `swap`, `list` can also return nothing yet.
- **No timeout.** Signed out on a blocked network, `baw wallet status --json` never exits and prints nothing.
  From a server: one leaked process per request, a scheduler that stops for good. We kill it after 30 s. 30 min.
- **Sessions don't survive containers.** The session file is AES-GCM encrypted with a key from the first NIC's MAC
  address, random per container: a restart gives `NOT_LOGGED_IN`. The fix is the undocumented
  `BINANCE_INSTANCE_ID` env var (plus undocumented `BINANCE_BAW_DIR`), found by reading `dist/index.js`. 40 min.
- **One session per wallet**: signing in on the server signed the laptop out. A fresh session lasts **48 h**
  (`signInMaxTime`); the first one on the same wallet had `signInMaxTime` +7 days. A server agent needs a QR
  re-sign-in every 2 days.
- A session died ~15 h after sign-in, well before its `sessionExpireTime`. Calls then return `SERVICE_ERROR`
  "illegal parameter" (`2`), not a session error, and only `baw auth signin` clears it.
- Error text: `30003001` "From token value greater than 5 USD" means the order is *below* the minimum.
  `103` "one side must be a supported stablecoin ({0})" leaves `{0}` unfilled, so it never says which ones.

**What is missing** (detail in §7): a read-only address-book listing (the agent can't verify the card is the only
entry), a dry-run for `swap`, a fee/referrer on `market-order swap`, a timeout and a typed "signed out" error, and a
library/HTTP API instead of a CLI per wallet.

## 5. Tokenized-stock specifics

- **Liquidity / slippage** (`baw market-order quote`, 7 tickers × $5/$20/$50): price impact flat from $5 to $50.
  Ondo has a fixed cost: at $5 it is 50–160 bps worse than at $20. bStock stays within ±30 bps at every size.
  Minimum order $5 everywhere.
- **Outside market hours** (Sat 3 Oct 16:54 UTC, #31): Ondo's on-chain price equals Friday's close × multiplier
  within ±0.01% for NVDA, AAPL, TSLA, MSFT, AMZN, GOOGL, META. It is pinned, not a market, so any weekend discount only
  shows in an executable quote. Status `offhours` (undocumented). bStock `stockInfo.price` is `null` all weekend.
- **Executable weekend quotes** (`baw market-order quote`, Sun 4 Oct 16:33 UTC, sell $20 vs the per-share
  reference, #31): no weekend discount. bStock +3…+21 bps, Ondo +13…+76 bps, the same range as a weekday
  premarket (28 Sep: bStock +3…+17, Ondo +9…+68). What a weekend seller pays is Ondo's spread and fixed cost, not
  the weekend itself. Ondo's buy side was cheaper than the reference for 4 of 7 tickers (e.g. MSFT −45 bps at $20),
  sell side always worse.
  Second weekend (Sat 10 Oct 16:19 UTC, from the VPS): the same. bStock +4…+20 bps, Ondo +10…+69 bps, Ondo buy
  side under the reference for 5 of 7. Two weekends, both quiet; we have no sample from a weekend with news.
- **On-chain vs reference gap**: not measurable from the API, since `referencePrice` is derived from the on-chain
  price (§3). We keep our own close reference.
- **bStocks vs Ondo, same underlying**:
  - Ondo only settles to USDT (`103` for USD1 and U); bStock swaps straight to USD1. Our refill path is two swaps for
    Ondo (token → USDT → USD1), one for bStock.
  - Ondo swaps are gas-relayed; USD1 legs cost the agent BNB.
  - Market status exists for Ondo only.
  - NVDAB vs NVDAon, premarket 28 Sep: 227.70 vs 228.06 per token, ratios 1.00078 vs 1.00172, per share 227.52 vs
    227.67. On the weekend bStock traded 0.03–0.41% under Ondo.
  - **xStocks**: not on this API. `rwa/platforms` (10 Oct) lists only `ondo` and `bstock`, and
    `rwa/tokens?binanceChainId=56` returns 488 tokens, Ondo 442 + bStock 46. We couldn't compare xStocks at all.

## 6. Redesign suggestions

`TODO Kiel: write this one yourself, it's opinion. Candidates from our notes:`
- One key, one envelope, real HTTP status codes across RWA, Trading and B402.
- Return per-token and per-share prices side by side with the ratio, and a reference price that is independent of
  the on-chain price (or say clearly that there isn't one).
- B402 permission as a checkbox on the existing key, with a sandbox, so payments can be tested on day one.
- Fetchable `llms.txt`, and a TypeScript SDK that signs requests, so the first call doesn't depend on reading the
  preHash section correctly.
- `baw` as a library (or HTTP) with timeouts, typed errors and config via documented env vars.

## 7. Requested capabilities

- Agentic Wallet: read-only `wallet address-book`; dry-run/simulate for `market-order swap`; `feePercent`/referrer
  on swaps; a session-expiry event or webhook; programmatic policy (address book, daily limit) for per-user setups;
  a library/HTTP API so one server can run many users' agents.
- RWA Data: market status and hours for bStocks; an independent reference price; POST for `rwa/price` with 100 addresses.
- Trading API: the minimum order size in the quote response and docs.
- B402: USD1/U EIP-712 domains in the docs; test mode without the application; split settlement (a fee to a second
  `payTo`), which we now do as two separate EIP-3009 authorizations.

---

**Evidence**: every row in [`dx-notes.md`](dx-notes.md) has date, author, URL/section and exact error. Live txs:
`0x693f6e5a…`, `0x5f482834…` (L1), `0x306caa7c…0dfc` (bStock via USD1),
`0xb315357f…e751a` (Developer Mode bypass). Code: [github.com/tozzecard/tozzecard](https://github.com/tozzecard/tozzecard).
