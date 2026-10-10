# Tozzecard × BNB Agent Studio (spike, #72)

A protocol-only seller agent scaffolded with **BNB Agent Studio** (`bag`, npm `@bnbagent/studio-cli` 0.0.14)
that exposes Tozzecard's read-only refill decision as a FREE service. **BSC testnet only**, throwaway
wallet, no LLM, no trading: the work hook just reads `GET /agent/preview` and `GET /agent/session` from
`https://api.tozzecard.xyz`.

Only our own files are here. The generated scaffold, `.studio/` (keystore) and `node_modules` are not
committed.

| File | What |
|---|---|
| `tozzecard.ts` | the work hook (`tozzecardWork`), goes to `app/agent/src/tozzecard.ts` in the scaffold |
| `studio.toml` | the generated config after the steps below (`app/agent/studio.toml`), no secrets |

## Reproduce

```sh
npm i @bnbagent/studio-cli@0.0.14          # local install, binary: node_modules/.bin/bag
bag init tozzecardagent --network bsc-testnet --wallet-kind evm-local --protocols A2A,MCP \
  --rails 8183 --seller-price-usd 0 --llm-provider none --destination self \
  --storage-provider local --no-auto-topup --no-onboard --ide claude-code
cd tozzecardagent/app/agent
bag wallet new --generate-password         # throwaway testnet wallet
cp <this dir>/tozzecard.ts src/tozzecard.ts
```

Wire the hook in **both** entrypoints (the scaffold builds the work hook twice):

```ts
// src/dualMain.ts
import { tozzecardWork } from "./tozzecard.js";
export function buildRunWork(): RunWork {
  return (prompt, { abortSignal }) => tozzecardWork(prompt, { abortSignal });
}

// src/mcpMain.ts
export function buildRunWork(): McpRunWork {
  return async (prompt, { abortSignal }) => {
    const { tozzecardWork } = await import("./tozzecard.js");
    return tozzecardWork(prompt, { abortSignal });
  };
}
```

```sh
bag doctor
bag dev        # A2A card: http://127.0.0.1:9000/.well-known/agent-card.json, MCP: http://127.0.0.1:9000/mcp
bag config set payments.erc8183.enabled true   # needed even for a FREE agent, see below
bag deploy prepare --provider bnb --backend aws
```

## Results (10 Oct 2026, 23:35–23:42 UTC)

- `bag init` created the project in 11 s. `bag wallet new` created `0x1B2c2d92B1d7aBB336CFE003e3687bc60AA7B4ff`
  (0 tBNB).
- `bag doctor`: all PASS, warnings only (no funds, no ERC-8004 identity, no AWS credentials, Docker daemon off).
- `bag dev`: agent card and MCP both on `:9000`; MCP listed 15 read-only tools (`wallet_info` … `network_info`).
- The hook passes `tsc --noEmit` and, run with bun, returned the live `hold` decision from our API.
- `bag deploy prepare --provider bnb --backend aws` first failed with
  `[CRITICAL] commerce_no_rail — No commerce rail is configured.`; after the `config set` above:
  `0 BLOCKED · 0 CRITICAL · 4 WARNING`.
- `bag platform whoami`: signed in with GitHub, "trial available", 0 agents.

**Not done**

- **Deploy** (`bag deploy --provider bnb --backend aws --accept-risk --yes`) was not run. `bag deploy status`:
  `No recorded deployments.`
- **ERC-8004 registration** was not done: `bag erc8004 register` takes its `--endpoint` from a successful deploy
  and we did not register a placeholder URL. `bag erc8004 show`:
  `error: Wallet 0x1B2c2d92B1d7aBB336CFE003e3687bc60AA7B4ff has no registered agent.`
- No ERC-8183 job, no x402 payment.

Findings are logged in [`docs/dx-notes.md`](../../../docs/dx-notes.md) (rows dated 2026-10-11).
