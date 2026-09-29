// Agent wallet: holds the stocks, buys, rebalances, refills the card.
// Owner: Fajar. Drives the user's Binance Agentic Wallet through the `baw` CLI.
// Invariant: stablecoin only ever leaves the agent wallet to the user's card address. Binance
// enforces this with the address book, but only while Developer Mode is off (docs/research.md §1),
// so every execution checks it (wallet/session.ts).
export * from "./baw/cli";
export * from "./card/refill";
export * from "./constants";
export * from "./portfolio/rebalance";
export * from "./trading/swap";
export * from "./wallet/session";
