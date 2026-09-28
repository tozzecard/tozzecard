// Agent wallet: holds the stocks, buys, rebalances, refills the card.
// Owner: Fajar. Execution path (Agentic Wallet CLI vs Skills) is decided by spike G1/G2.
// Invariant: USDT only ever leaves the agent wallet to the user's card address.

export interface Agent {
  buy(token: string, usdt: string): Promise<string>;
  sell(token: string, amount: string): Promise<string>;
  refill(cardAddress: string, usdt: string): Promise<string>;
}
