// Binance Web3 API client, shared by apps/api and packages/agent.
// Owner: Kiel. Request signing lands after spike G5 (docs/plan.md §5).

export const BSC_CHAIN_ID = "56";

/** Market status values returned in RWA Data `statusInfo.marketStatus`. */
export type MarketStatus =
  | "premarket"
  | "regular"
  | "postmarket"
  | "overnight"
  | "closed"
  | "pause";
