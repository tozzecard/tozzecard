import { expect, test } from "bun:test";
import { isRegularOpen, nextClose, nextOpen } from "./calendar";

const utc = (mo: number, d: number, h: number, mi = 0) => Date.UTC(2026, mo - 1, d, h, mi);

test("Friday 2 Oct: open at 15:59 NY, closed at 16:00; close is 20:00 UTC (EDT)", () => {
  expect(isRegularOpen(utc(10, 2, 19, 59))).toBe(true);
  expect(isRegularOpen(utc(10, 2, 20))).toBe(false);
  expect(nextClose(utc(10, 2, 15))).toBe(utc(10, 2, 20));
});

test("over the weekend the next open is Monday 09:30 NY", () => {
  expect(isRegularOpen(utc(10, 3, 15))).toBe(false);
  expect(nextOpen(utc(10, 2, 20))).toBe(utc(10, 5, 13, 30));
  expect(nextOpen(utc(10, 4, 23))).toBe(utc(10, 5, 13, 30));
  expect(nextClose(utc(10, 3, 12))).toBe(utc(10, 5, 20));
});

test("premarket is not the regular session", () => {
  expect(isRegularOpen(utc(10, 5, 13, 29))).toBe(false);
  expect(isRegularOpen(utc(10, 5, 13, 30))).toBe(true);
  expect(nextOpen(utc(10, 5, 12))).toBe(utc(10, 5, 13, 30));
});

test("after DST ends (1 Nov) the open moves to 14:30 UTC", () => {
  expect(nextOpen(utc(10, 31, 12))).toBe(utc(11, 2, 14, 30));
  expect(nextClose(utc(11, 2, 15))).toBe(utc(11, 2, 21));
});

test("holidays are skipped: Thanksgiving 26 Nov", () => {
  expect(isRegularOpen(utc(11, 26, 16))).toBe(false);
  expect(nextOpen(utc(11, 25, 22))).toBe(utc(11, 27, 14, 30));
});
