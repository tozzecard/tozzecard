// Cards: sign-in with the card's own key, and the card face (number, expiry, CVV) the app shows.
// The card is an EOA whose key lives in the browser behind a passkey (plan §3.1); we never see
// the key. Signing in = signing a one-time message with it, which proves the browser holds it.
// ponytail: the number and CVV are display identifiers, not a payment-network PAN. Payments are
// passkey-signed B402 authorizations; nothing accepts these digits as a credential.
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "viem";

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 86_400_000;
const EXPIRY_YEARS = 3;
// Major industry identifier 9 (national use): no payment network issues numbers from it.
const NUMBER_PREFIX = "9406";

export interface Card {
  address: string;
  holder: string;
  number: string;
  /** MM/YY */
  expiry: string;
  cvv: string;
  createdAt: number;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hex = (bytes: number) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");
// ponytail: byte % 10 is slightly biased; irrelevant for display digits.
const digits = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b % 10).join("");

/** Luhn check digit for `payload`, so the number passes the same check a real card does. */
export function luhnDigit(payload: string): string {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    let d = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function cleanHolder(name: unknown): string | null {
  const s = typeof name === "string" ? name.trim().replace(/\s+/g, " ").toUpperCase() : "";
  return /^[A-Z][A-Z .'-]{0,25}$/.test(s) ? s : null;
}

export function createCards(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    address TEXT PRIMARY KEY, holder TEXT NOT NULL, number TEXT NOT NULL UNIQUE,
    expiry TEXT NOT NULL, cvv TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS challenges (
    message TEXT PRIMARY KEY, address TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, address TEXT NOT NULL, expires_at INTEGER NOT NULL)`);

  const read = db.prepare<Record<string, string | number>, [string]>(
    "SELECT * FROM cards WHERE address = ?",
  );
  const toCard = (r: Record<string, string | number>): Card => ({
    address: getAddress(String(r.address)),
    holder: String(r.holder),
    number: String(r.number),
    expiry: String(r.expiry),
    cvv: String(r.cvv),
    createdAt: Number(r.created_at),
  });
  const get = (address: string) => {
    const r = read.get(address.toLowerCase());
    return r ? toCard(r) : null;
  };

  function issue(address: string, holder: string, now: number): Card {
    const body = NUMBER_PREFIX + digits(11);
    const exp = new Date(now);
    const expiry = `${String(exp.getUTCMonth() + 1).padStart(2, "0")}/${String((exp.getUTCFullYear() + EXPIRY_YEARS) % 100).padStart(2, "0")}`;
    // ponytail: a number collision (1 in 10^11) fails the insert; the client just signs in again.
    db.run("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?)", [
      address.toLowerCase(),
      holder,
      body + luhnDigit(body),
      expiry,
      digits(3),
      now,
    ]);
    return get(address) as Card;
  }

  /** Step 1: a one-time message for the card key to sign. */
  function challenge(address: string, now = Date.now()): { message: string } {
    if (!isAddress(address)) throw new Error("not an address");
    db.run("DELETE FROM challenges WHERE expires_at < ?", [now]);
    const message = `Sign in to Tozzecard\nCard: ${getAddress(address)}\nNonce: ${hex(16)}\nIssued: ${new Date(now).toISOString()}`;
    db.run("INSERT INTO challenges VALUES (?, ?, ?)", [
      message,
      address.toLowerCase(),
      now + CHALLENGE_TTL_MS,
    ]);
    return { message };
  }

  /**
   * Step 2: the signed message → a bearer token. The first sign-in issues the card.
   * Null when the message is unknown, used, expired, or not signed by the card key.
   */
  async function signIn(
    message: string,
    signature: string,
    holder: string | null,
    now = Date.now(),
  ): Promise<{ token: string; card: Card; created: boolean } | null> {
    const row = db
      .query<{ address: string; expires_at: number }, [string]>(
        "DELETE FROM challenges WHERE message = ? RETURNING address, expires_at",
      )
      .get(message);
    if (!row || row.expires_at < now) return null;
    const ok = await verifyMessage({
      address: row.address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    }).catch(() => false);
    if (!ok) return null;

    const existing = get(row.address);
    const card = existing ?? issue(row.address, holder ?? "CARDHOLDER", now);
    const token = hex(32);
    db.run("DELETE FROM sessions WHERE expires_at < ?", [now]);
    db.run("INSERT INTO sessions VALUES (?, ?, ?)", [
      sha256(token),
      row.address,
      now + SESSION_TTL_MS,
    ]);
    return { token, card, created: !existing };
  }

  /** `Authorization: Bearer <token>` → the signed-in card, or null. */
  function auth(header: string | undefined, now = Date.now()): Card | null {
    const token = header?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
    if (!token) return null;
    const s = db
      .query<{ address: string; expires_at: number }, [string]>(
        "SELECT address, expires_at FROM sessions WHERE token_hash = ?",
      )
      .get(sha256(token));
    return s && s.expires_at > now ? get(s.address) : null;
  }

  function rename(address: string, holder: string): Card {
    db.run("UPDATE cards SET holder = ? WHERE address = ?", [holder, address.toLowerCase()]);
    return get(address) as Card;
  }

  const signOut = (header: string | undefined) => {
    const token = header?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
    if (token) db.run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
  };

  return { challenge, signIn, auth, signOut, get, rename };
}

export type Cards = ReturnType<typeof createCards>;
