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
bag deploy --provider bnb --backend aws --accept-risk --yes   # stop `bag dev` first
bag deploy verify --provider bnb                              # registers the ERC-8004 identity
bag wallet fund                                               # testnet tBNB + U
```

## Results (10 Oct 23:35 – 11 Oct 00:02 UTC, 2026)

Everything below ran on BSC testnet (chain 97) with the throwaway wallet
`0x1B2c2d92B1d7aBB336CFE003e3687bc60AA7B4ff`.

| Step | Result |
|---|---|
| `bag init` | project created in 11 s |
| `bag doctor` | all PASS, warnings only |
| `bag dev` | A2A card and MCP both on `:9000`; MCP lists 15 read-only tools |
| `bag deploy --provider bnb --backend aws --accept-risk --yes` | managed 48 h trial, agent `01M4M3ZMDKZD00GM57NY2WRTN4`, state `running` (until ~12 Oct 23:57 UTC) |
| `bag deploy verify --provider bnb` | ERC-8004 identity, **agent_id 2592**, registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`, sponsored gas |
| `bag wallet fund` | 0.1 tBNB + 5 U |
| A2A `negotiate` (OAuth client from `bag platform invoke-client new`) | signed quote, price 0 |
| `bag erc8183 buy --provider <wallet> --quote-json quote.json` | **job 1431** created and funded |
| A2A `notify_funded` | `accepted`; job `SUBMITTED` 28 s later |
| `bag erc8183 fetch 1431` | the deliverable is our hook's output: the Tozzecard refill decision |

Agent card: <https://bnbagent-api.bnbchain.world/v1/rt/01M4M3ZMDKZD00GM57NY2WRTN4/.well-known/agent-card.json>
Deliverable: <https://bnbagent-api.bnbchain.world/v1/deliverables/sha256/08b64cc4bc668a88c04e55cc15561f3140e1b30c0f9665029fec30e35b160ad2.json>

Transactions (testnet.bscscan.com):

| What | Tx |
|---|---|
| ERC-8004 register | `0xfb6ce7ec7b7d6bc57e856d720b30d8764cba3f9c9c0e9f271aa70b94cf7d4696`, `0xdcfb6c57dd1da481e18adc6075e297c1e9b4b54b88f7fc129840c4ad8a4b26c3` |
| Faucet tBNB / U | `0xf567aeeb3709ffedeb73372f3f66cc909298de7c453e10711e64ff920292d282`, `0x55e2b942e29484474dc1b4be75eb4c93433242a542518f13e05152cd6c793a61` |
| Job 1431 create / register / setBudget / fund | `0x811754031f08aa3c1ec6d6922bdbc1b50d8f7d9cf75a117e1ef8d96375ceba14`, `0x0751eb155e2e7537082d1e517a7864ccb424e3b31c254efc34829e18832e2c82`, `0x8620ac883955b23ea0222ddf673de2046613c1c34de2ab32044865751fad80e1`, `0xddd054e38bd9fabe5fbc7bb5bc9da1a0eec4d25967dffce5854703ad3f275644` |

Things that cost time:

- `bag deploy` printed one line and then nothing for 10 minutes while a `bag dev` was still running; it went on as
  soon as that process was killed.
- The `negotiate` request needs `terms.currency` (the token address, here testnet U
  `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565`), or `erc8183 buy` refuses the quote with
  `quote request currency is missing`. The example the CLI prints leaves it out.
- A FREE job is not gas-sponsored: `create job with token is not sponsorable on this network`. Fund first.
- The deployed MCP endpoint answers 409 `Agent speaks A2A, not MCP — use the A2A surface.`; use A2A.
- A FREE, no-LLM agent fails `bag deploy prepare` with `commerce_no_rail` until
  `bag config set payments.erc8183.enabled true`.

**Not done**: the one-prompt skill (`/bnbagent-studio`), paid x402, mainnet, settling job 1431 (the dispute window
was still open).

Findings are logged in [`docs/dx-notes.md`](../../../docs/dx-notes.md) (rows dated 2026-10-11).
