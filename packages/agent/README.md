# @tozzecard/agent

Drives the user's own **Binance Agentic Wallet** through the `baw` CLI: holds the tokenized
stocks, sells into USD1, refills the card, rebalances. Owner: Fajar.

**Invariant:** stablecoin only leaves the agent wallet to the user's card. Binance enforces it with
the wallet's address book (`351703`), but only while Developer Mode is off, so every execution
calls `assertSafe()` first. Background: [`docs/research.md`](../../docs/research.md) §1.

## Layout

```
src/
  index.ts               public API (re-exports only)
  constants.ts           USDT, USD1, MIN_ORDER_USD
  baw/cli.ts             spawn baw (Node), timeout, JSON envelope → value | BawError
  wallet/session.ts      session(), assertSafe()
  trading/swap.ts        quote, swap (poll to terminal), buy, sell, sellForCard
  card/refill.ts         refill(card, usd1)
  portfolio/rebalance.ts holdings, planRebalance (pure), rebalance
  testing/fake-baw.ts    test-only stub of baw + fixtures
scripts/
  signin.ts              sign the wallet in on this machine or server
  demo-allowlist.ts      demo: sending anywhere but the card is refused
  price-impact.ts        quotes vs the real stock price (weekend contrast)
```

Tests sit next to the module they cover (`*.test.ts`).

## Use

```ts
import { assertSafe, rebalance, refill, sellForCard, session } from "@tozzecard/agent";

const sold = await sellForCard(token, qty); // bStock → USD1, Ondo → USDT → USD1
await refill(cardAddress, sold.at(-1)?.order.toTokenActualQty ?? "0");
```

Errors from baw are `BawError` with its `code`/`name`. Names callers act on: `SESSION_EXPIRED`
(ask the user to sign in again), `TIMEOUT` (outcome unknown, don't retry blindly).

## Scripts

```bash
bun packages/agent/scripts/signin.ts          # prints QR link + pairing code, waits ≤ 5 min
bun packages/agent/scripts/demo-allowlist.ts  # expects "Blocked by Binance (351703)"
bun packages/agent/scripts/price-impact.ts NVDA AAPL
```

## Running it

- **Node must be on `PATH`.** baw runs under Node; Bun can't create the secp256k1 key its sign-in needs.
- **Indonesia:** the ISP blocks `*.binance.com` DNS. Use WARP/VPN; the errors look like
  `NETWORK_ERROR` or `SSL_ERROR "certificate has expired"`.
- **One session per wallet.** Signing in on one machine signs out the others. A fresh session lasts
  48h (`session().signInMaxTime`).
- **In Docker:** mount `/data` (session lives in `BINANCE_BAW_DIR=/data/baw`) and pass
  `BINANCE_INSTANCE_ID` as a secret; otherwise baw keys the session file to the container's MAC
  address and a new container is signed out.

```bash
bun test packages/agent
```
