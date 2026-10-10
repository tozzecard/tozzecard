import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { cleanHolder, createCards, holderFromDocument, luhnDigit } from "./card";
import { parseStrategy } from "./strategy";

const valid = (n: string) => luhnDigit(n.slice(0, -1)) === n.at(-1);

test("luhn matches a known number", () => {
  expect(luhnDigit("7992739871")).toBe("3");
  expect(valid("4111111111111111")).toBe(true);
});

const SECRET = "x".repeat(32);
const doc = (n: string) => ({
  fullName: "Carmen Española Española",
  issuingState: "ESP",
  documentType: "Identity Card",
  documentNumber: n,
});

test("sign in, then the card is issued only after the identity check, derived and stable", async () => {
  const db = new Database(":memory:");
  const cards = createCards(db, SECRET);
  const key = privateKeyToAccount(generatePrivateKey());
  const now = Date.UTC(2026, 9, 10);

  const { message } = cards.challenge(key.address, now);
  const signature = await key.signMessage({ message });
  const first = await cards.signIn(message, signature, now);
  expect(first).toMatchObject({ address: key.address, kyc: "none", card: null });
  expect(cards.auth(`Bearer ${first?.token}`, now)?.address).toBe(key.address);

  // Replaying the same signed message fails.
  expect(await cards.signIn(message, signature, now)).toBeNull();

  cards.kycStarted(key.address, "s1");
  expect(cards.get(key.address)?.kyc).toBe("pending");
  expect(cards.approve(key.address, doc("CAA000000"), now)).toBe("approved");
  const card = cards.get(key.address)?.card;
  expect(card?.holder).toBe("CARMEN ESPANOLA ESPANOLA");
  expect(card?.number).toMatch(/^9406\d{12}$/);
  expect(valid(card?.number ?? "")).toBe(true);
  expect(card?.expiry).toBe("10/29");
  expect(card?.cvv).toMatch(/^\d{3}$/);
  // Nothing card-secret in the DB: the number comes back the same from the secret alone.
  expect(JSON.stringify(db.query("SELECT * FROM accounts").all())).not.toContain(card?.number);
  expect(createCards(db, SECRET).get(key.address)?.card).toEqual(card);

  // Approved never goes back.
  cards.setKyc(key.address, "declined");
  cards.kycStarted(key.address, "s2");
  expect(cards.get(key.address)?.kyc).toBe("approved");

  cards.signOut(`Bearer ${first?.token}`);
  expect(cards.auth(`Bearer ${first?.token}`, now)).toBeNull();
});

test("one document, one card", async () => {
  const cards = createCards(new Database(":memory:"), SECRET);
  const [a, b] = [generatePrivateKey(), generatePrivateKey()].map((k) => privateKeyToAccount(k));
  for (const k of [a, b]) {
    const { message } = cards.challenge(k.address);
    await cards.signIn(message, await k.signMessage({ message }));
  }
  cards.kycStarted(a.address, "sa");
  cards.kycStarted(b.address, "sb");
  expect(cards.bySession("sb")).toBe(b.address.toLowerCase());
  expect(cards.approve(a.address, doc("X1"))).toBe("approved");
  expect(cards.approve(b.address, { ...doc(" x1 "), fullName: "Someone Else" })).toBe("duplicate");
  expect(cards.get(b.address)?.card).toBeNull();
  expect(cards.approve(b.address, doc("X2"))).toBe("approved");
  expect(cards.get(b.address)?.card?.number).not.toBe(cards.get(a.address)?.card?.number);
});

test("a signature from another key or an expired challenge is refused", async () => {
  const cards = createCards(new Database(":memory:"), SECRET);
  const card = privateKeyToAccount(generatePrivateKey());
  const thief = privateKeyToAccount(generatePrivateKey());

  const { message } = cards.challenge(card.address, 0);
  expect(await cards.signIn(message, await thief.signMessage({ message }), 0)).toBeNull();

  const m2 = cards.challenge(card.address, 0).message;
  const late = 5 * 60_000 + 1;
  expect(await cards.signIn(m2, await card.signMessage({ message: m2 }), late)).toBeNull();
  expect(cards.auth("Bearer nope")).toBeNull();
  expect(() => cards.challenge("0x123")).toThrow();
  expect(() => createCards(new Database(":memory:"), "short")).toThrow();
});

test("holder names are cleaned", () => {
  expect(cleanHolder("  alex   lee ")).toBe("ALEX LEE");
  expect(cleanHolder("<script>")).toBeNull();
  expect(cleanHolder("A".repeat(27))).toBeNull();
  expect(holderFromDocument("Maximiliano Alejandro Fernández de la Cruz")).toBe(
    "MAXIMILIANO ALEJANDRO",
  );
  expect(holderFromDocument("李小龍")).toBe("CARDHOLDER");
});

test("strategy: symbols resolve, weights add up to 1", () => {
  const known: Record<string, string> = { NVDAon: "0xaa", AAPLon: "0xbb" };
  const resolve = (k: string) => known[k] ?? Object.values(known).find((a) => a === k);
  expect(
    parseStrategy({ targets: { NVDAon: 0.7, "0xbb": 0.3 }, weeklyEstimateUsd: 80 }, resolve),
  ).toEqual({ targets: { "0xaa": 0.7, "0xbb": 0.3 }, weeklyEstimateUsd: 80 });
  expect(parseStrategy({ targets: { NVDAon: 0.5 }, weeklyEstimateUsd: 80 }, resolve)).toMatch(
    /add up/,
  );
  expect(parseStrategy({ targets: { TSLAon: 1 }, weeklyEstimateUsd: 80 }, resolve)).toMatch(
    /unknown/,
  );
  expect(parseStrategy({ targets: { NVDAon: 1 }, weeklyEstimateUsd: -1 }, resolve)).toMatch(
    /weekly/,
  );
});
