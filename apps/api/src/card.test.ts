import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { cleanHolder, createCards, luhnDigit } from "./card";
import { parseStrategy } from "./strategy";

const valid = (n: string) => luhnDigit(n.slice(0, -1)) === n.at(-1);

test("luhn matches a known number", () => {
  expect(luhnDigit("7992739871")).toBe("3");
  expect(valid("4111111111111111")).toBe(true);
});

test("sign in issues the card once, token works, message is single use", async () => {
  const cards = createCards(new Database(":memory:"));
  const key = privateKeyToAccount(generatePrivateKey());
  const now = Date.UTC(2026, 9, 10);

  const { message } = cards.challenge(key.address, now);
  const signature = await key.signMessage({ message });
  const first = await cards.signIn(message, signature, "ALEX LEE", now);
  expect(first?.created).toBe(true);
  expect(first?.card.address).toBe(key.address);
  expect(first?.card.holder).toBe("ALEX LEE");
  expect(first?.card.number).toMatch(/^9406\d{12}$/);
  expect(valid(first?.card.number ?? "")).toBe(true);
  expect(first?.card.expiry).toBe("10/29");
  expect(first?.card.cvv).toMatch(/^\d{3}$/);
  expect(cards.auth(`Bearer ${first?.token}`, now)?.number).toBe(first?.card.number);

  // Replaying the same signed message fails.
  expect(await cards.signIn(message, signature, null, now)).toBeNull();

  // Signing in again keeps the same card.
  const m2 = cards.challenge(key.address, now).message;
  const again = await cards.signIn(m2, await key.signMessage({ message: m2 }), null, now);
  expect(again?.created).toBe(false);
  expect(again?.card.number).toBe(first?.card.number);

  cards.signOut(`Bearer ${again?.token}`);
  expect(cards.auth(`Bearer ${again?.token}`, now)).toBeNull();
});

test("a signature from another key or an expired challenge is refused", async () => {
  const cards = createCards(new Database(":memory:"));
  const card = privateKeyToAccount(generatePrivateKey());
  const thief = privateKeyToAccount(generatePrivateKey());

  const { message } = cards.challenge(card.address, 0);
  expect(await cards.signIn(message, await thief.signMessage({ message }), null, 0)).toBeNull();

  const m2 = cards.challenge(card.address, 0).message;
  const late = 5 * 60_000 + 1;
  expect(await cards.signIn(m2, await card.signMessage({ message: m2 }), null, late)).toBeNull();
  expect(cards.auth("Bearer nope")).toBeNull();
  expect(() => cards.challenge("0x123")).toThrow();
});

test("holder names are cleaned", () => {
  expect(cleanHolder("  alex   lee ")).toBe("ALEX LEE");
  expect(cleanHolder("<script>")).toBeNull();
  expect(cleanHolder("A".repeat(27))).toBeNull();
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
