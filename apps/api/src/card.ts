// Cards: sign-in with the card's own key, the identity check that issues the card, and the card
// face (number, expiry, CVV) the app shows. The card is an EOA whose key lives in the browser
// behind a passkey (plan §3.1); we never see the key. Signing in = signing a one-time message
// with it, which proves the browser holds it. The card is issued once Didit approves the holder
// (kyc.ts), with the holder name from the document.
// ponytail: the number and CVV are display identifiers, not a payment-network PAN. Payments are
// passkey-signed B402 authorizations; nothing accepts these digits as a credential.
import type { Database } from "bun:sqlite";
import { createHash, createHmac } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "viem";

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 86_400_000;
const EXPIRY_YEARS = 3;
// Major industry identifier 9 (national use): no payment network issues numbers from it.
const NUMBER_PREFIX = "9406";

export type Kyc = "none" | "pending" | "approved" | "declined" | "duplicate";

export interface Card {
  address: string;
  holder: string;
  number: string;
  /** MM/YY */
  expiry: string;
  cvv: string;
  createdAt: number;
}

export interface Account {
  address: string;
  kyc: Kyc;
  /** Null until the identity check is approved. */
  card: Card | null;
}

/** What the approved identity document says (from Didit's decision). */
export interface IdentityDocument {
  fullName: string;
  issuingState: string;
  documentType: string;
  documentNumber: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hex = (bytes: number) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");

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

/** "Carmen Española Española" → "CARMEN ESPANOLA ESPANOLA": accents dropped, whole words up to 26. */
export function holderFromDocument(fullName: string): string {
  const words = fullName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z .'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let s = "";
  for (const w of words) {
    const next = s ? `${s} ${w}` : w;
    if (next.length > 26) break;
    s = next;
  }
  return cleanHolder(s) ?? "CARDHOLDER";
}

/**
 * `secret` (CARD_SECRET) derives each card's number and CVV and hashes identity documents, so
 * nothing card-secret sits in the DB and a stored document hash can't be brute-forced back.
 * Changing it changes every card number.
 */
export function createCards(db: Database, secret: string) {
  if (secret.length < 32) throw new Error("CARD_SECRET must be at least 32 characters");
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    address TEXT PRIMARY KEY, kyc TEXT NOT NULL DEFAULT 'none', kyc_session TEXT UNIQUE,
    identity TEXT UNIQUE, holder TEXT, issued_at INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS challenges (
    message TEXT PRIMARY KEY, address TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, address TEXT NOT NULL, expires_at INTEGER NOT NULL)`);

  const hmac = (label: string, s: string) =>
    createHmac("sha256", secret).update(`${label}:${s}`).digest();
  const digitsOf = (label: string, address: string, n: number) =>
    (BigInt(`0x${hmac(label, address).toString("hex")}`) % 10n ** BigInt(n))
      .toString()
      .padStart(n, "0");

  function face(address: string, holder: string, issuedAt: number): Card {
    // ponytail: two cards share a number 1 in 10^11; display only, so no uniqueness check.
    const body = NUMBER_PREFIX + digitsOf("number", address, 11);
    const d = new Date(issuedAt);
    return {
      address: getAddress(address),
      holder,
      number: body + luhnDigit(body),
      expiry: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String((d.getUTCFullYear() + EXPIRY_YEARS) % 100).padStart(2, "0")}`,
      cvv: digitsOf("cvv", address, 3),
      createdAt: issuedAt,
    };
  }

  type Row = { address: string; kyc: Kyc; holder: string | null; issued_at: number | null };
  const read = db.prepare<Row, [string]>("SELECT * FROM accounts WHERE address = ?");
  function get(address: string): Account | null {
    const r = read.get(address.toLowerCase());
    if (!r) return null;
    const card =
      r.kyc === "approved" && r.holder && r.issued_at
        ? face(r.address, r.holder, r.issued_at)
        : null;
    return { address: getAddress(r.address), kyc: r.kyc, card };
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
   * Step 2: the signed message → a bearer token. Null when the message is unknown, used,
   * expired, or not signed by the card key. The card itself comes after the identity check.
   */
  async function signIn(
    message: string,
    signature: string,
    now = Date.now(),
  ): Promise<({ token: string } & Account) | null> {
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

    db.run("INSERT OR IGNORE INTO accounts (address) VALUES (?)", [row.address]);
    const token = hex(32);
    db.run("DELETE FROM sessions WHERE expires_at < ?", [now]);
    db.run("INSERT INTO sessions VALUES (?, ?, ?)", [
      sha256(token),
      row.address,
      now + SESSION_TTL_MS,
    ]);
    return { token, ...(get(row.address) as Account) };
  }

  /** `Authorization: Bearer <token>` → the signed-in account, or null. */
  function auth(header: string | undefined, now = Date.now()): Account | null {
    const token = header?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
    if (!token) return null;
    const s = db
      .query<{ address: string; expires_at: number }, [string]>(
        "SELECT address, expires_at FROM sessions WHERE token_hash = ?",
      )
      .get(sha256(token));
    return s && s.expires_at > now ? get(s.address) : null;
  }

  const signOut = (header: string | undefined) => {
    const token = header?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
    if (token) db.run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
  };

  /** A Didit session was opened for this account. An approved card never goes back. */
  function kycStarted(address: string, sessionId: string) {
    db.run(
      "UPDATE accounts SET kyc = 'pending', kyc_session = ? WHERE address = ? AND kyc != 'approved'",
      [sessionId, address.toLowerCase()],
    );
  }

  /** The account a Didit session belongs to (only its latest session counts). */
  const bySession = (sessionId: string) =>
    db
      .query<{ address: string }, [string]>("SELECT address FROM accounts WHERE kyc_session = ?")
      .get(sessionId)?.address ?? null;

  /** An approved card never goes back. */
  const setKyc = (address: string, kyc: Kyc) =>
    db.run("UPDATE accounts SET kyc = ? WHERE address = ? AND kyc != 'approved'", [
      kyc,
      address.toLowerCase(),
    ]);

  /** Approved by Didit → issue the card, unless this document already holds one. */
  function approve(address: string, doc: IdentityDocument, now = Date.now()): Kyc {
    const a = address.toLowerCase();
    const identity = hmac(
      "identity",
      [doc.issuingState, doc.documentType, doc.documentNumber]
        .map((s) => s.trim().toUpperCase())
        .join("|"),
    ).toString("hex");
    try {
      // UNIQUE(identity) refuses a second account for the same document, races included.
      db.run(
        "UPDATE accounts SET kyc = 'approved', identity = ?, holder = ?, issued_at = COALESCE(issued_at, ?) WHERE address = ?",
        [identity, holderFromDocument(doc.fullName), now, a],
      );
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
      setKyc(a, "duplicate");
    }
    return (get(a) as Account).kyc;
  }

  return { challenge, signIn, auth, signOut, get, kycStarted, bySession, setKyc, approve };
}

export type Cards = ReturnType<typeof createCards>;
