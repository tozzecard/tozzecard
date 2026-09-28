# Contributing

## Flow

1. Branch from `main`: `<name>/<topic>`, e.g. `fajar/refill-swap`, `axel/passkey-card`.
2. Keep PRs small and inside your area (see `.github/CODEOWNERS`). Touching someone else's area? Tag them.
3. `bun run lint && bun run typecheck && bun test` must pass. CI runs the same.
4. One approval from the area owner, then squash-merge.

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `feat(api): spend forecaster`, `fix(web): passkey on Safari`.
Scopes: `web`, `api`, `agent`, `binance`, `docs`, `ci`.

## Rules that are not negotiable

- **Never commit a key.** Agent wallets sign real BSC mainnet funds. Secrets live in `.env` only.
- **Every swap is dry-run first** through the Transaction API.
- **Stablecoin leaves the agent wallet only to the user's card address** (Agentic Wallet address book).
- **No custom smart contracts.** Only Binance, BNB Chain or token-issuer contracts. Changing this needs a team decision (docs/plan.md §12).
- **No mock numbers in the app.** Everything shown comes from the API or the chain.

## Developer Experience notes

The DX report is 25% of the score and judges reject generic or AI-written reports. Whenever an API,
doc page or tool slows you down, add a line to [`docs/dx-notes.md`](docs/dx-notes.md) **right then**:
date, URL, exact section, exact error, how long you were stuck.
