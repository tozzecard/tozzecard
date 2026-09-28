import { expect, test } from "bun:test";
import type { Forecast } from "./forecast";
import { type Position, planRefill } from "./refill";

const utc = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h, mi);
// Flat $1/hour so needs are easy to read
const perHour = (usdPerHour: number): Forecast => ({
  rate: { weekday: usdPerHour * 24, weekend: usdPerHour * 24 },
  confidence: 1,
  need: (from, until) => ((until - from) / 3_600_000) * usdPerHour,
});

const pos = (symbol: string, valueUsd: number, target: number, spread: number | null = 0) =>
  ({ symbol, address: `0x${symbol}`, valueUsd, target, spread, sellable: true }) as Position;
// NVDAon is overweight (70 of 100 vs 50%)
const book = [pos("NVDAon", 70, 0.5, 0.002), pos("TSLAB", 30, 0.5, 0.001)];

test("Friday 15:40 NY: refills for the weekend from the most overweight stock", () => {
  const d = planRefill({
    now: utc(10, 2, 19, 40), // 15:40 EDT
    cardUsd: 20,
    forecast: perHour(1),
    positions: book,
  });
  // horizon = Monday 09:30 NY; 65h50m × $1 × 1.2 = 79 → short 59
  expect(d.action).toBe("refill");
  if (d.action !== "refill") return;
  expect(d.horizon).toBe(utc(10, 5, 13, 30));
  expect(d.usd).toBeCloseTo(79 - 20);
  expect(d.symbol).toBe("NVDAon");
  expect(d.reason).toContain("most overweight");
});

test("Friday midday: short but not low, so it waits for the pre-close window", () => {
  const d = planRefill({ now: utc(10, 2, 16), cardUsd: 20, forecast: perHour(1), positions: book });
  expect(d.action).toBe("none");
  expect(d.reason).toContain("last 30 min");
});

test("open and below the floor: refills now, at least the minimum order", () => {
  const d = planRefill({
    now: utc(10, 2, 16),
    cardUsd: 5,
    forecast: perHour(0.01),
    positions: book,
  });
  expect(d).toMatchObject({ action: "refill", usd: 5 });
});

test("enough on the card: nothing to do", () => {
  const d = planRefill({
    now: utc(10, 2, 19, 40),
    cardUsd: 500,
    forecast: perHour(1),
    positions: book,
  });
  expect(d.action).toBe("none");
});

test("weekend, card low, prices far from Friday's close: hold and say why", () => {
  const d = planRefill({
    now: utc(10, 3, 15),
    cardUsd: 3,
    forecast: perHour(1),
    positions: [pos("NVDAon", 70, 0.5, -0.032), pos("TSLAB", 30, 0.5, 0.025)],
  });
  expect(d).toMatchObject({ action: "hold", symbol: "TSLAB", spread: 0.025 });
  if (d.action === "hold") expect(d.reason).toContain("2.5% off Friday's close");
});

test("weekend, card low, one price near the close: sells just enough to reach the floor", () => {
  const d = planRefill({
    now: utc(10, 3, 15),
    cardUsd: 3,
    forecast: perHour(0.05),
    positions: [pos("NVDAon", 70, 0.5, -0.032), pos("TSLAB", 30, 0.5, 0.004)],
  });
  // back to the $10 floor only: 10 - 3 = 7, not the $40+ needed until Monday
  expect(d).toMatchObject({ action: "refill", symbol: "TSLAB", usd: 7 });
});

test("weekend, card above the floor: waits for Monday even if short", () => {
  const d = planRefill({ now: utc(10, 3, 15), cardUsd: 15, forecast: perHour(1), positions: book });
  expect(d.action).toBe("none");
  expect(d.reason).toContain("Waiting for the open");
});

test("paused, too small or unanchored positions are never picked", () => {
  const d = planRefill({
    now: utc(10, 3, 15),
    cardUsd: 1,
    forecast: perHour(0.05),
    positions: [
      { ...pos("PAUSEDon", 100, 0.5, 0), sellable: false },
      pos("TINYon", 3, 0.25, 0),
      pos("NEWon", 100, 0.25, null),
    ],
  });
  expect(d).toMatchObject({ action: "hold" });
  expect(d.reason).toContain("no sellable position");
});
