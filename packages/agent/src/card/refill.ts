// Refilling the user's card: the only way stablecoin leaves the agent wallet.
import { BSC_CHAIN_ID } from "@tozzecard/binance";
import { cli } from "../baw/cli";
import { USD1 } from "../constants";
import { assertSafe } from "../wallet/session";

/** Send USD1 to the card. Binance rejects any address not in the address book (`351703`). */
export async function refill(cardAddress: string, usd1: string): Promise<string> {
  await assertSafe();
  const { txHash } = await cli.run<{ txHash: string }>([
    "wallet",
    "send",
    "--amount",
    usd1,
    "--recipient",
    cardAddress,
    "--binanceChainId",
    BSC_CHAIN_ID,
    "--tokenAddress",
    USD1,
  ]);
  return txHash;
}
