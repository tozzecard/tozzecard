// Spend forecaster v1 (plan §3.3): average daily spend per bucket (weekday / weekend) over a
// lookback, in the user's timezone. Days before the card existed count at the onboarding estimate,
// so the forecast slides from the estimate to real behaviour as history builds up.
// ponytail: two buckets and a flat average; per-weekday buckets or decay if the demo needs them.

const DAY = 86_400_000;

export interface Spend {
  at: number; // ms
  usd: number;
}

export interface ForecastInput {
  spends: Spend[];
  /** Onboarding answer, USD per week. */
  weeklyEstimateUsd: number;
  cardCreatedAt: number;
  /** User's UTC offset in minutes, e.g. 420 for WIB. */
  tzOffsetMinutes: number;
  lookbackDays?: number;
}

export type Bucket = "weekday" | "weekend";

export interface Forecast {
  /** USD per day. */
  rate: Record<Bucket, number>;
  /** Share of the lookback covered by real history, 0–1. */
  confidence: number;
  /** Expected spend between two instants. */
  need(from: number, until: number): number;
}

/** Start of the user's local day containing `t`, as a UTC ms instant. */
function dayStart(t: number, tz: number) {
  const local = t + tz * 60_000;
  return local - (((local % DAY) + DAY) % DAY) - tz * 60_000;
}

function bucketOf(t: number, tz: number): Bucket {
  const day = new Date(t + tz * 60_000).getUTCDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

export function forecast(input: ForecastInput, now: number): Forecast {
  const { spends, weeklyEstimateUsd, cardCreatedAt, tzOffsetMinutes: tz } = input;
  const lookback = input.lookbackDays ?? 28;
  const estimatePerDay = weeklyEstimateUsd / 7;

  // Whole local days before today, newest first.
  const today = dayStart(now, tz);
  const sum = { weekday: 0, weekend: 0 };
  const days = { weekday: 0, weekend: 0 };
  let observed = 0;
  for (let i = 1; i <= lookback; i++) {
    const start = today - i * DAY;
    const b = bucketOf(start, tz);
    days[b]++;
    if (start + DAY <= cardCreatedAt) {
      sum[b] += estimatePerDay;
      continue;
    }
    observed++;
    for (const s of spends) if (s.at >= start && s.at < start + DAY) sum[b] += s.usd;
  }

  const rate = {
    weekday: days.weekday ? sum.weekday / days.weekday : estimatePerDay,
    weekend: days.weekend ? sum.weekend / days.weekend : estimatePerDay,
  };

  return {
    rate,
    confidence: observed / lookback,
    need(from, until) {
      let total = 0;
      for (let t = from; t < until; ) {
        const end = Math.min(until, dayStart(t, tz) + DAY);
        total += (rate[bucketOf(t, tz)] * (end - t)) / DAY;
        t = end;
      }
      return total;
    },
  };
}
