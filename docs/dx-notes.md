# Developer Experience notes

Raw notes for the DX report. Write them the moment something happens; Kiel compiles the report.
Be specific: URL + section, exact error text, minutes lost. No summaries, no AI rewriting.

| Date (WIB) | Who | Area | URL / section | What happened (exact error) | Time lost |
| --- | --- | --- | --- | --- | --- |
| 2026-09-28 | Kiel | docs | /en/dev-docs/authentication, "PreHash Construction" | Example encodes the space as `%20`. JS `URLSearchParams` writes `+`, which would give a different preHash (expect 40102). Docs don't warn about it; we encode by hand. | 0 (caught while reading) |
| 2026-09-28 | Kiel | api | GET /build/api/v1/dex/market/rwa/platforms | Error body is `{"msg":"API Key is required","data":"","code":40101,...}`: no `success` field, although every success example has `success: true`. `data` is `""` instead of `null`. Clients that check `success === false` miss the error. | 0 |
| 2026-09-28 | Kiel | docs | /en/dev-docs/llms.txt, llms-full.txt | `curl` returns an empty body (bot check, HTTP 202). The files meant to be fed to agents can't be fetched by an agent's plain HTTP client. | 10 min |
| 2026-09-28 | Kiel | api | GET /build/api/v1/dex/market/rwa/platforms | First authenticated call worked on the first try: 282 ms. `rwa/tokens?binanceChainId=56`: 330 ms, 488 tokens (Ondo 442, bStock 46). | 0 |
| 2026-09-28 | Kiel | tokenized-stock | rwa/tokens vs rwa/price vs rwa/underlying-market | Same token, three prices, each off by one factor of `tokenToShareRatio`. Checked against a Trading API sell quote (~$10): `/price.tokenPrice` matches (≤0.23%). `/tokens.tokenPrice` = true × ratio (SOXSon, ratio 0.1017: 0.3536 vs 3.4773, −89.8%; ECOon, ratio 1.0621: +6.45%). `/tokens.referencePrice` equals the true token price, not a per-share price. `/underlying-market.marketData.referencePrice` = true ÷ ratio² (SOXSon 336.13 vs 34.19 from `/price`). Invisible for NVDA (ratio 1.0017), wrong for the 259 BSC tokens with ratio ≠ 1. Repro: `bun run --cwd packages/binance price-check SOXSon ECOon NVDAon`. | 40 min |
| 2026-09-28 | Kiel | tokenized-stock | rwa/tokens, rwa/price `referencePrice` | For all 488 BSC tokens, `/tokens.tokenPrice` = `/tokens.referencePrice` × `tokenToShareRatio` exactly (0 of 488 differ by >0.01%). The "reference" is derived from the on-chain price, not an independent quote, so the API alone cannot show the on-chain vs underlying gap the track brief describes. The docs do say "derived from the on-chain token price", but the hackathon page sells it as two prices to compare. | — |
| 2026-09-28 | Kiel | api | GET /build/api/v1/dex/aggregator/quote | Quoting 1 SOXSon ($0.35) returns HTTP **200** with `{"code":40375,"msg":"Minimum order amount is 5 USD."}`. Minimum not documented on the quote page; an error with HTTP 200. | 5 min |
| 2026-09-28 | Kiel | api | several RWA endpoints | `42900 Rate limit exceeded` after ~6 calls in under a second across *different* endpoints, although the documented default is 5 RPS per endpoint. | 5 min |
| 2026-09-28 | Kiel | docs | trading-api, quote parameters | `feePercent` pairs with `feeSource` (FROM_TOKEN/TO_TOKEN) on the quote page, while the swap docs describe `fromTokenReferrerWalletAddress` / `toTokenReferrerWalletAddress`. Two naming schemes for the same fee. | — |
| | | onboarding / docs / api / ai-stack / tokenized-stock | | | |

Areas map to the report sections: onboarding, documentation issues, API pitfalls, AI stack
(Agentic Wallet / Skills / CLI), tokenized-stock specifics (liquidity, slippage, off-hours behaviour,
on-chain vs reference gap, bStocks vs Ondo vs xStocks), redesign suggestions, requested capabilities.
