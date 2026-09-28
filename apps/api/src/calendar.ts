// US regular session (NYSE/Nasdaq): Mon–Fri 09:30–16:00 America/New_York, minus holidays.
// We keep our own calendar because rwa `nextOpenTime`/`nextCloseTime` are the boundaries of
// whatever session is current (premarket, regular, ...), and bStocks carry none at all.
// ponytail: 2026 full-day holidays only; early closes (Nov 27, Dec 24 at 13:00) are treated as
// full days. Add them, and next year's list, if the product outlives the hackathon.

const NY = "America/New_York";
const HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const DAY = 86_400_000;

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY,
  timeZoneName: "shortOffset",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

function ny(t: number) {
  const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
  const [, sign, h, m] = /GMT([+-])(\d+)(?::(\d+))?/.exec(p.timeZoneName) ?? [];
  const offsetMin = sign ? (sign === "-" ? -1 : 1) * (Number(h) * 60 + Number(m ?? 0)) : 0;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    weekday: p.weekday,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    offsetMin,
  };
}

/** UTC instant of a New York wall-clock time on the NY date of `t`. */
function nyTime(t: number, minutes: number) {
  const { y, mo, d } = ny(t);
  const guess = Date.UTC(y, mo - 1, d) + minutes * 60_000;
  return guess - ny(guess).offsetMin * 60_000;
}

function isTradingDay(t: number) {
  const { date, weekday } = ny(t);
  return weekday !== "Sat" && weekday !== "Sun" && !HOLIDAYS_2026.has(date);
}

export function isRegularOpen(t: number) {
  const { minutes } = ny(t);
  return isTradingDay(t) && minutes >= OPEN && minutes < CLOSE;
}

/** Next regular-session open strictly after `t`. */
export function nextOpen(t: number) {
  for (let day = t; ; day += DAY) {
    if (!isTradingDay(day)) continue;
    const open = nyTime(day, OPEN);
    if (open > t) return open;
  }
}

/** Next regular-session close at or after `t`. */
export function nextClose(t: number) {
  for (let day = t; ; day += DAY) {
    if (!isTradingDay(day)) continue;
    const close = nyTime(day, CLOSE);
    if (close >= t) return close;
  }
}
