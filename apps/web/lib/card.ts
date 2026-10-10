import type { Me } from "./api";

/**
 * Whether the card is active. With an identity check on the API (issue #50) that is KYC approval;
 * until then it is the agent link: this card is the one the Agentic Wallet refills.
 */
export function isActive(me: Me | null): boolean {
  if (!me?.card) return false;
  return me.kyc ? me.kyc === "approved" : me.agent.linked;
}
