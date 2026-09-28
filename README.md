# Tozzecard

**Your stocks, managed by an agent. Your spending, from a card you own. And your card never sells at weekend prices.**

Built for the [BNB Chain × Binance Web3 Wallet Tokenized Stocks hackathon](https://www.bnbchain.org/en/hackathons/tokenized-stocks). BSC mainnet, spot only.

## The idea

Tokenized stocks trade around the clock; the market behind them does not. From Friday 4pm New York
to Monday morning the reference price is frozen while the on-chain price drifts. Anyone who sells
stock to pay for something over the weekend sells at a discount.

Tozzecard splits the job in two:

- **The agent wallet** holds your tokenized stocks (Ondo, bStocks). It buys, rebalances, and refills your card.
- **The card** is a wallet you own (passkey, no seed phrase) that holds USDT for spending.

The agent learns how much you spend and when, and refills the card **while the market is open**,
before you need it, selling whatever is overweight. One trade tops up the card and rebalances the
portfolio. The agent can only ever send to your card. Nobody holds your money but you.

Full design: [`docs/plan.md`](docs/plan.md).

## Repository

| Path | What | Owner |
| --- | --- | --- |
| [`apps/web`](apps/web) | Cardholder app: onboarding, card, pay, portfolio, agent feed (Next.js) | Axel |
| [`apps/api`](apps/api) | Backend: market hours, spend forecaster, refill/rebalance scheduler, decision log (Bun + Hono) | Kiel |
| [`packages/agent`](packages/agent) | Agent wallet execution: quote → dry-run → swap → refill | Fajar |
| [`packages/binance`](packages/binance) | Binance Web3 API client (RWA Data, Market, Trading, Transaction, Wallet) | Kiel |
| [`docs`](docs) | Plan, developer experience notes | All |

## Team

| Member | Role | Owns |
| --- | --- | --- |
| **Fajar** ([@FjrREPO](https://github.com/FjrREPO)) | Agent & Web3 lead | Agentic Wallet, Trading/Transaction API, allowlist, fees |
| **Kiel** ([@yeheskieltame](https://github.com/yeheskieltame)) | Backend & data lead | API client, forecaster, scheduler, **Developer Experience Report** |
| **Axel** | Frontend & UX lead | App, passkey card, payments, **demo video** |

## Getting started

```bash
bun install
cp .env.example .env   # fill in your Binance Web3 API key
bun dev                # web on :3000, api on :8787
```

| Command | |
| --- | --- |
| `bun dev` | Run every app |
| `bun run typecheck` | Type-check every workspace |
| `bun run lint` / `bun run format` | Biome |
| `bun test` | Tests |

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR.
