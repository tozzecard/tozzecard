# Contributing

## Flow

1. Branch from `main`: `<name>/<topic>`, e.g. `fajar/refill-swap`, `axel/passkey-card`.
2. Keep PRs small and inside your area (see `.github/CODEOWNERS`). Touching someone else's area? Tag them.
3. `bun run lint && bun run typecheck && bun test` must pass. CI runs the same.
4. Ask the area owner for review. `main` is protected: CI must be green, and a
   **"changes requested" review blocks the merge until it is resolved**. No approval count is
   enforced so nobody waits on an idle teammate, but don't merge over open review comments.
   Squash-merge and delete the branch.

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
