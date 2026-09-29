// Agentic Wallet session state, and the safety check every execution runs first.
import { BawError, cli } from "../baw/cli";

export interface Session {
  connected: boolean;
  devMode?: boolean;
  /** Signs out at this time unless used again (48h idle). ISO with offset, as baw returns it. */
  sessionExpireTime?: string;
  /** Hard limit: re-sign-in in the Binance App needed by then (+48h on a fresh sign-in). */
  signInMaxTime?: string;
  /** USD left of the wallet's daily limit today. */
  quotaLeft?: number;
}

/** For the scheduler (warn before expiry) and the UI. Read-only. */
export async function session(): Promise<Session> {
  const { status } = await cli.run<{ status: string }>(["wallet", "status"]);
  if (status !== "CONNECTED") return { connected: false };
  const s = await cli.run<{
    devMode: { enabled: boolean };
    sessionExpireTime: string;
    signInMaxTime: string;
    quotaLeft: number;
  }>(["wallet", "settings"]);
  return {
    connected: true,
    devMode: s.devMode.enabled,
    sessionExpireTime: s.sessionExpireTime,
    signInMaxTime: s.signInMaxTime,
    quotaLeft: s.quotaLeft,
  };
}

/**
 * Before every execution: the session must be live (it expires after 48h idle and needs the
 * user's Binance App to renew), and Developer Mode must be off, since contract-call bypasses the
 * address book (docs/research.md §1).
 */
export async function assertSafe() {
  const s = await session();
  if (!s.connected)
    throw new BawError(
      0,
      "SESSION_EXPIRED",
      "Agentic Wallet is signed out; sign in again in the Binance App.",
    );
  if (s.devMode)
    throw new Error(
      "Developer Mode is on; it bypasses the card allowlist. Turn it off in the Binance App.",
    );
}
