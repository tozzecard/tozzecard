@AGENTS.md

# @tozzecard/web

Cardholder app at `app.tozzecard.xyz` (Next.js 16, React 19, Tailwind 4). Owner: Axel.
`bun run dev` → localhost:3000 (the landing holds :3001). API: `NEXT_PUBLIC_API_URL`, default
`https://api.tozzecard.xyz`, whose CORS already allows localhost:3000 and app.tozzecard.xyz.

## Shape

| Path | What |
| --- | --- |
| `app/page.tsx` | Onboarding: create a card with a passkey, or sign in with one |
| `app/(app)/` | Tabs behind `AuthGate`: `home` (card, balance, statement), `portfolio` (market clock, holdings vs targets), `agent` (decision feed, Agentic Wallet session) |
| `app/(flow)/pay` | B402 payment: demo till without `?order=`, Face ID and settle with it |
| `lib/passkey.ts` | Card key from the passkey via Mera (PRF → BIP-39 → m/44'/60'/0'/0/0). Nothing stored; changing the derivation changes every card's address |
| `providers/CardProvider.tsx` | Session (`{token, address}` in localStorage) and the unlocked key (memory only) |
| `lib/api.ts` | Typed client for the API; types follow `/openapi.json` |
| `components/ui`, `motion`, `card`, `activity` | UI kit copied from the frontend owner's earlier card app, adjusted to this product |

## Rules

- No mock numbers: every figure comes from the API or the chain (CONTRIBUTING).
- `/portfolio`, `/agent/*` and `/merchant/*` return 404 while the server's agent or merchant is
  off. `useApi` reports that as `off`; screens show "not running", never an error.
- Passkeys are bound to the hostname: a card made on localhost does not exist on app.tozzecard.xyz.
- Read the clock in an effect, never during render (hydration).

## Deploy

Vercel project `tozzecard-web` (Root Directory `apps/web`) is connected to `tozzecard/tozzecard`:
every merge to `main` deploys `app.tozzecard.xyz`, every PR gets a preview. `vercel.json` skips the
build when a commit touches nothing under `apps/web`, `packages/binance`, the root `package.json` or
`bun.lock`. The landing (`tozzecard-landing`, `apps/landing`) works the same way for `tozzecard.xyz`.
