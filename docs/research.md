# Research: official stack & smart contracts

Researched 2026-09-28 from official sources only. Tags: **[BN]** Binance docs · **[BNB]** BNB Chain docs · **[3P]** third party · **[ISS]** issuer docs · **[CHAIN]** our own read-only calls to BSC mainnet.
Anything marked *unverified* must be tested live before we rely on it (see "Live checks").

## 1. Binance Agentic Wallet (the agent wallet)

| Question | Finding | Source |
|---|---|---|
| Custody | MPC, key "never fully reconstructed on any single device or server". Created in the **user's own Binance App**, needs a Binance account. Keys cannot be exported. | [BN] agentic-wallet/welcome, install |
| Driven from our backend? | Yes, through the `baw` CLI (`npm @binance/agentic-wallet`), `--json` on every command. **Sign-in needs the user to confirm in the Binance App**; sessions expire (example 48h) or on inactivity. No HTTP API / SDK documented. | [BN] skills-hub `binance-agentic-wallet/SKILL.md`, `references/authentication.md`, `wallet-setting.md` |
| Destination allowlist | **Yes, enforced by Binance.** "The `--recipient` address **must** be in the address book." Address book, daily limit, token allowlist are edited **only in the Binance App**, "Settings cannot be changed via the CLI." | [BN] `references/send.md`, `wallet-setting.md` |
| Swap tokenized stocks on BSC | Yes, `baw market-order swap` (bStock, Ondo). Limit orders can fail for Ondo ("Ondo-related tokens cannot be traded"); limit-sell output only USDT/USDC/native. | [BN] stock-trading, `SKILL.md` |
| Arbitrary contract calls | Only in Developer Mode (enabled in the App). Other page says it "does not sign or initiate arbitrary transactions" by default. We don't need it. | [BN] `references/external-sign.md`, agentic-wallet/introduction |
| Scheduling | Not server-side. Scheduling lives on our side (cron → `baw`), capped by the user's daily limit. | [BN] automated-strategies |
| Gasless / smart accounts | Not documented. Gas paid in BNB. | [BN] `references/gas.md` |
| Integrator fee on swaps | *Unverified.* `baw market-order swap` has no documented referrer/`feePercent`. | — |

## 2. Binance Web3 API

| Question | Finding | Source |
|---|---|---|
| Auth | HMAC-SHA256, headers `X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`; optional IP whitelist; VPN/proxy rejected (40302); US/UK/CA/NL blocked. | [BN] /authentication |
| Wallet API | Read-only (balances, tx history). No wallet creation, signing or policies. | [BN] wallet-api |
| Transaction API | Broadcasts a **client-signed** tx; optional `enableMevProtection`; screens risky/sanctioned addresses (40311–40314). No gas sponsorship. | [BN] transaction-api |
| Trading API | Returns calldata we sign; router for chain 56 `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5` (*recheck*); `feePercent` + referrer supported. **Ondo sells go through RFQ** (EIP-712 sign → `POST /order/submit` → poll). | [BN] trading-api, supported-chains |
| **B402** | Binance's x402 facilitator, **BSC only**. "B402 submits the settlement transaction while sponsoring network gas. Funds move directly to the merchant's configured receiving address." Merchant-server API; `payTo` write-once per project. | [BN] b402-api/introduction |
| B402 tokens | **U** and **USD1**: EIP-3009, no approval, gasless for payer. **USDT/USDC**: Permit2 only, payer approves Permit2 once (costs gas). Facilitator signer/spender addresses not published, read from `/api/v2/b402/supported`. | [BN] b402-api/payment-methods |
| Card / merchant / on-ramp | Not documented anywhere. | [BN] llms.txt |

## 3. BNB Chain

| Question | Finding | Source |
|---|---|---|
| MegaFuel paymaster | Standard by BNB Chain (BEP-322/414), **operated by NodeReal**, beta. Sponsors plain EOAs; policy can whitelist USDT `transfer`. Mainnet: we fund the policy with our own BNB. | [BNB] paymaster/overview · [3P] docs.nodereal.io |
| EIP-7702 | Live since Pascal, 2025-03-20. | [BNB] announce/pascal-bsc |
| ERC-4337 EntryPoint | Deployed on mainnet (v0.6/0.7/0.8), addresses only from third parties. BNB Chain endorses no smart-account provider. | [3P] · [CHAIN] |
| P-256 (passkey) precompile | Live since Haber, 2024-06-20, at `0x100` (BEP-381). | [BNB] announce/haber-bsc |
| Agent Studio | ERC-8004 identity + ERC-8183 + x402. Wallet with spend caps only via third parties (Altana, Turnkey). Sponsored paymaster testnet only. | [BNB] developer-kit/bnbchain-studio |

## 4. Tokenized stocks on BSC

| Issuer | Finding | Source |
|---|---|---|
| Ondo | On BSC mainnet, transferable outside the US; acquiring prohibited for US persons and listed countries; redemption needs KYC. Token has `compliance()` + pause manager; zero-value transfer between fresh addresses succeeded → looks like blocklist, *unverified for non-zero*. | [ISS] docs.ondo.finance · [CHAIN] |
| bStocks | Issued by Binance, BEP-20, withdrawable "to any BSC-compatible wallet". "Only open to permitted-jurisdiction qualified users." Contract restrictions *unverified*. | [BNB] · [BN] campaign.md |
| xStocks | BNB Chain announced live (2026-04-30); issuer FAQ doesn't list BNB Chain; not in RWA Data API. *Unverified.* | [BNB] · [ISS] |

## Live checks (must pass before the design is final)

| # | Check | Owner |
|---|---|---|
| L1 | `baw` sign-in, `market-order swap` Ondo/bStock → USDT on BSC with a few dollars | Fajar |
| L2 | `baw wallet send` to an address **not** in the address book is rejected (demo proof) | Fajar |
| L3 | Can `baw` swap to **USD1** (or U) directly? Liquidity/price impact for $5–50 | Fajar |
| L4 | Does `baw` swap accept a referrer/fee? If not, revenue model changes | Fajar |
| L5 | B402 end to end: our merchant server returns 402, a browser-held key signs EIP-3009 for USD1, B402 settles, payer holds zero BNB | Kiel + Axel |
| L6 | WebAuthn PRF works in target browsers (Chrome, Safari iOS) to unlock the card key | Axel |
| L7 | Ondo non-zero transfer between two non-KYC wallets succeeds | Fajar |
| L8 | Eligibility from Indonesia: Binance account + bStock/Ondo trading allowed | All |
