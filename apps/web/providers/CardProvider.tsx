"use client";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { LocalAccount } from "viem";
import { API_URL, api, type Card } from "../lib/api";
import { createCardKey, unlockCardKey } from "../lib/passkey";
import { STORAGE } from "../lib/storage";

/** What survives a reload: the API token and the card it belongs to. Never the key. */
interface Session {
  token: string;
  address: string;
}

export interface CardContextValue {
  /** False until storage has been read, so a gate never bounces a valid session. */
  hydrated: boolean;
  session: Session | null;
  /** The unlocked key, in memory for this visit only. Null after a reload until the next Face ID. */
  account: LocalAccount | null;
  /** New card: passkey, then the first sign-in, which issues the card face. */
  create: (holder: string) => Promise<Card | null>;
  /** Existing card: passkey, then sign in. */
  signIn: () => Promise<Card | null>;
  /** The key for signing (a payment), asking for Face ID only if it is not unlocked yet. */
  unlock: () => Promise<LocalAccount>;
  signOut: () => Promise<void>;
}

export const CardContext = createContext<CardContextValue | null>(null);

function read(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE.session);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function write(session: Session | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE.session, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE.session);
  } catch {
    // Storage refused (private mode): the session lasts for this visit.
  }
}

/** POST /auth/challenge → sign with the card key → POST /auth/verify. */
async function authenticate(account: LocalAccount, holder?: string) {
  const { message } = await api<{ message: string }>("/auth/challenge", {
    method: "POST",
    body: { address: account.address },
  });
  const signature = await account.signMessage({ message });
  // #51: `{token, address, kyc, card}` with `card` null until identity is approved. The older API
  // returned only `{token, card}`, with the address on the card.
  return api<{ token: string; address?: string; card: Card | null }>("/auth/verify", {
    method: "POST",
    body: { message, signature, ...(holder ? { holder } : {}) },
  });
}

export function CardProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<LocalAccount | null>(null);

  useEffect(() => {
    setSession(read());
    setHydrated(true);
  }, []);

  const start = useCallback(async (key: LocalAccount, holder?: string) => {
    const { token, address, card } = await authenticate(key, holder);
    const next = { token, address: address ?? card?.address ?? key.address };
    write(next);
    setSession(next);
    setAccount(key);
    return card;
  }, []);

  const create = useCallback(
    async (holder: string) => start(await createCardKey(holder), holder),
    [start],
  );
  const signIn = useCallback(async () => start(await unlockCardKey()), [start]);

  const unlock = useCallback(async () => {
    if (account) return account;
    const key = await unlockCardKey();
    if (session && key.address.toLowerCase() !== session.address.toLowerCase())
      throw new Error("That passkey belongs to a different card.");
    setAccount(key);
    return key;
  }, [account, session]);

  const signOut = useCallback(async () => {
    if (session) {
      await fetch(`${API_URL}/auth/signout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
      }).catch(() => {});
    }
    write(null);
    setSession(null);
    setAccount(null);
  }, [session]);

  const value = useMemo(
    () => ({ hydrated, session, account, create, signIn, unlock, signOut }),
    [hydrated, session, account, create, signIn, unlock, signOut],
  );
  return <CardContext.Provider value={value}>{children}</CardContext.Provider>;
}
