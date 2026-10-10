// The card key, from a passkey (plan §3.1). Mera reads 32 bytes from the passkey's PRF extension;
// the same passkey always yields the same bytes, so the card's EOA is derived again on every
// sign-in and no secret is ever stored. Face ID or a fingerprint is the only thing the user sees.
//
// Derivation follows Mera's walkthrough: PRF bytes → BIP-39 entropy → seed → m/44'/60'/0'/0/0.
// Changing any step changes every card's address, so it is fixed here and nowhere else.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";
import { STORAGE } from "./storage";

const PATH = "m/44'/60'/0'/0/0";

function accountFrom(prfOutput: Uint8Array): LocalAccount {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(PATH);
  if (!node.privateKey) throw new Error("Could not derive the card key.");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.wipePrivateData();
  return toViemAccount(session);
}

const rpId = () => window.location.hostname;

function remember(credentialId: string) {
  try {
    window.localStorage.setItem(STORAGE.credential, credentialId);
  } catch {
    // Private mode: the browser still offers the passkey by itself.
  }
}

/** New card: one Face ID prompt (two on authenticators that only evaluate PRF on sign-in). */
export async function createCardKey(holder: string): Promise<LocalAccount> {
  const name = holder.trim() || "Tozzecard";
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Tozzecard" },
    user: { name, displayName: `${name} · Tozzecard` },
  });
  remember(result.credentialId);
  return accountFrom(result.prfOutput);
}

/** Existing card: the browser offers the passkeys it holds for this site. */
export async function unlockCardKey(): Promise<LocalAccount> {
  const result = await getPasskeyPrfOutput({ rpId: rpId() });
  remember(result.credentialId);
  return accountFrom(result.prfOutput);
}

/** A sentence a person can act on, for any passkey failure. */
export function passkeyError(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE")
      return "This device's passkeys can't hold a card key. Try iCloud Keychain, Google Password Manager or 1Password.";
    if (e.code === "PASSKEY_OPERATION_FAILED") return "Face ID was cancelled or timed out.";
  }
  return e instanceof Error ? e.message : "Something went wrong with the passkey.";
}
