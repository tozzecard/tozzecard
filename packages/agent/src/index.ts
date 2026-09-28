// Agent wallet: holds the stocks, buys, rebalances, refills the card.
// Owner: Fajar. Drives the user's Binance Agentic Wallet through the `baw` CLI.
// Invariant: stablecoin only ever leaves the agent wallet to the user's card address,
// enforced by the Agentic Wallet address book (docs/research.md §1).

export interface Agent {
  buy(token: string, usd: string): Promise<string>;
  sell(token: string, amount: string): Promise<string>;
  refill(cardAddress: string, usd: string): Promise<string>;
}
