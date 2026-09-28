import { expect, test } from "bun:test";
import { forecast } from "./forecast";

const H = 3_600_000;
const D = 24 * H;
const WIB = 420;
// Monday 5 Oct 2026, 12:00 WIB
const NOW = Date.UTC(2026, 9, 5, 5);
// Local midnight WIB of a date in Oct 2026
const wib = (day: number, hour = 0) => Date.UTC(2026, 9, day, hour) - WIB * 60_000;

test("a new card forecasts the onboarding estimate, spread evenly", () => {
  const f = forecast(
    { spends: [], weeklyEstimateUsd: 70, cardCreatedAt: NOW, tzOffsetMinutes: WIB },
    NOW,
  );
  expect(f.rate).toEqual({ weekday: 10, weekend: 10 });
  expect(f.confidence).toBe(0);
  expect(f.need(NOW, NOW + 2 * D)).toBeCloseTo(20);
});

test("a month of history replaces the estimate, weekend and weekday separately", () => {
  // Every day of the 28 before NOW: 5 USD on weekdays, 40 USD on weekend days
  const spends = [];
  for (let i = 1; i <= 28; i++) {
    const day = wib(5) - i * D;
    const dow = new Date(day + WIB * 60_000).getUTCDay();
    spends.push({ at: day + 13 * H, usd: dow === 0 || dow === 6 ? 40 : 5 });
  }
  const f = forecast(
    { spends, weeklyEstimateUsd: 700, cardCreatedAt: NOW - 60 * D, tzOffsetMinutes: WIB },
    NOW,
  );
  expect(f.confidence).toBe(1);
  expect(f.rate.weekday).toBeCloseTo(5);
  expect(f.rate.weekend).toBeCloseTo(40);
  // Friday 16:00 WIB → Monday 00:00 WIB: 8 h of Friday + Sat + Sun
  expect(f.need(wib(9, 16), wib(12))).toBeCloseTo((8 / 24) * 5 + 80);
});

test("half a lookback of history blends with the estimate for the older half", () => {
  // Card created 14 days ago, spent nothing since; estimate 70/week = 10/day
  const f = forecast(
    { spends: [], weeklyEstimateUsd: 70, cardCreatedAt: wib(5) - 14 * D, tzOffsetMinutes: WIB },
    NOW,
  );
  expect(f.confidence).toBe(0.5);
  expect(f.rate.weekday).toBeCloseTo(5);
  expect(f.rate.weekend).toBeCloseTo(5);
});

test("weekend is the user's local weekend, not UTC's", () => {
  // Saturday 03:00 WIB is still Friday in UTC; a spend there counts as weekend
  const f = forecast(
    {
      spends: [{ at: wib(3, 3), usd: 80 }],
      weeklyEstimateUsd: 0,
      cardCreatedAt: NOW - 60 * D,
      tzOffsetMinutes: WIB,
    },
    NOW,
  );
  expect(f.rate.weekday).toBe(0);
  expect(f.rate.weekend).toBeCloseTo(80 / 8); // 8 weekend days in 28
});

test("today's spends don't count yet (partial day)", () => {
  const f = forecast(
    {
      spends: [{ at: NOW - H, usd: 1000 }],
      weeklyEstimateUsd: 0,
      cardCreatedAt: NOW - 60 * D,
      tzOffsetMinutes: WIB,
    },
    NOW,
  );
  expect(f.rate).toEqual({ weekday: 0, weekend: 0 });
});
