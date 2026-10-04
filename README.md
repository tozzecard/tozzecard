# Tozzecard

**Your stocks, managed by an agent. Your spending, from a card you own. And your card never sells at weekend prices.**

Built for the [BNB Chain × Binance Web3 Wallet Tokenized Stocks hackathon](https://www.bnbchain.org/en/hackathons/tokenized-stocks). BSC mainnet, spot only.

## The idea

Tokenized stocks trade around the clock; the market behind them does not. From Friday 4pm New York
to Monday morning the reference price is frozen while the on-chain price drifts. Anyone who sells
stock to pay for something over the weekend sells at a discount.

Tozzecard splits the job in two:

- **The agent wallet** holds your tokenized stocks (Ondo, bStocks). It buys, rebalances, and refills your card.
- **The card** is a wallet you own (passkey, no seed phrase) that holds USD1 and pays through B402, Binance's gasless x402 rail. It never needs BNB.

The agent learns how much you spend and when, and refills the card **while the market is open**,
before you need it, selling whatever is overweight. One trade tops up the card and rebalances the
portfolio. The agent can only ever send to your card: the Agentic Wallet address book, which only you can edit in the Binance App, holds nothing else. Nobody holds your money but you, and every contract involved is Binance's, BNB Chain's or the token issuer's.

Full design: [`docs/plan.md`](docs/plan.md). Evidence behind every technical claim: [`docs/research.md`](docs/research.md).

## Repository

| Path | What | Owner |
| --- | --- | --- |
| [`apps/web`](apps/web) | Cardholder app: onboarding, card, pay, portfolio, agent feed (Next.js) | Axel |
| [`apps/api`](apps/api) | Backend: market hours, spend forecaster, refill/rebalance scheduler, decision log (Bun + Hono) | Kiel |
| [`packages/agent`](packages/agent) | Agent wallet execution: quote → dry-run → swap → refill | Fajar |
| [`packages/binance`](packages/binance) | Binance Web3 API client (RWA Data, Market, Trading, Transaction, Wallet) | Kiel |
| [`docs`](docs) | Plan, research, developer experience notes | All |

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

## API (`apps/api`)

| Endpoint | |
| --- | --- |
| `GET /health` | Liveness + last market poll |
| `GET /market`, `GET /market/:symbol` | Status, on-chain price, close reference, spread (`SPYon` for the market clock) |
| `GET /portfolio` | Agent wallet holdings with weight vs target and market data, plus the card's USD1 |
| `GET /agent/decisions?limit=` | Agent feed (decision log), newest first |
| `GET /agent/session` | Agentic Wallet session: connected, Developer Mode, expiry |
| `GET /agent/preview?at=ISO` | What the agent would decide at that time (demo time travel, never trades) |
| `POST /merchant/orders`, `GET /merchant/orders/:id`, `/merchant/orders/:id/pay` | Demo merchant, B402 (x402) |

`/portfolio` and `/agent/*` exist when `AGENT_MODE` is `dry` or `live`. Errors are `{error, code}`;
`code: "SESSION_EXPIRED"` / `"NOT_LOGGED_IN"` means the Agentic Wallet needs a sign-in. Browser
origins are allowed through `WEB_ORIGIN`.

## Deployment

| Service | Where | URL |
| --- | --- | --- |
| `apps/api` | VPS, Docker Compose, SQLite + baw session in `./data` | https://api.tozzecard.xyz |

The API polls Binance every minute and keeps the last regular-session price as the close reference,
so it has to run continuously. The VPS must sit outside the US/UK/CA/NL: the Binance Web3 API refuses that traffic.

```bash
# on the VPS, once
git clone https://github.com/tozzecard/tozzecard && cd tozzecard
cp .env.example .env    # fill in keys; BINANCE_INSTANCE_ID=$(openssl rand -hex 32)
docker compose up -d --build
docker compose exec api bun packages/agent/scripts/signin.ts   # scan the QR in the Binance App

# update
git pull && docker compose up -d --build
```

[`docker-compose.yml`](docker-compose.yml) runs one container in its own Compose project (`tozzecard`),
listening on `127.0.0.1:8787` only (`API_HOST_PORT` to change it). On our VPS (`/opt/tozzecard`) Caddy
runs in another Compose project, so a `docker-compose.override.yml` there (not in git) also joins its
network `deploy_default` as `tozzecard-api`, and the Caddyfile has `api.tozzecard.xyz { reverse_proxy tozzecard-api:8787 }`. Data lives in `./data` next to the compose
file: back it up, it holds the close references and the Agentic Wallet session. Secrets live in `.env` on the VPS, never in the repo.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR.
