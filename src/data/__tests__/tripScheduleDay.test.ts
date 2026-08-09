import { describe, expect, it } from "vitest";
import {
  daysUntilTrip,
  initialDayIndex,
  isoDate,
  itemInstant,
  todayIndex,
  type TripDay,
} from "../tripSchedule";

// A stand-in trip, so these tests keep passing when the real itinerary is
// re-exported from Notion with different dates.
const DAYS = [
  { date: "2026-08-30", city: "首爾", theme: "", items: [] },
  { date: "2026-08-31", city: "首爾", theme: "", items: [] },
  { date: "2026-09-01", city: "釜山", theme: "", items: [] },
] as unknown as TripDay[];

/** Local-time constructor: the helpers read the device's calendar date. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe("isoDate", () => {
  it("formats the local calendar date, not UTC", () => {
    expect(isoDate(at(2026, 8, 30, 23, 30))).toBe("2026-08-30");
    expect(isoDate(at(2026, 9, 1, 0, 15))).toBe("2026-09-01");
  });
});

describe("todayIndex", () => {
  it("finds the day being travelled", () => {
    expect(todayIndex(at(2026, 8, 30), DAYS)).toBe(0);
    expect(todayIndex(at(2026, 9, 1), DAYS)).toBe(2);
  });

  it("is -1 outside the trip", () => {
    expect(todayIndex(at(2026, 8, 29, 23, 59), DAYS)).toBe(-1);
    expect(todayIndex(at(2026, 9, 2), DAYS)).toBe(-1);
  });
});

describe("initialDayIndex", () => {
  it("opens on today while travelling", () => {
    expect(initialDayIndex(at(2026, 8, 31), DAYS)).toBe(1);
  });

  it("opens on day 1 before departure", () => {
    expect(initialDayIndex(at(2026, 7, 25), DAYS)).toBe(0);
  });

  it("opens on the last day after the trip", () => {
    expect(initialDayIndex(at(2026, 9, 5), DAYS)).toBe(2);
  });

  it("still opens on day 1 on the eve of departure", () => {
    expect(initialDayIndex(at(2026, 8, 29, 22, 0), DAYS)).toBe(0);
  });
});

describe("itemInstant", () => {
  it("combines the day's date with the row's local time", () => {
    expect(itemInstant("2026-08-31", "15:30")).toEqual(at(2026, 8, 31, 15, 30));
  });

  it("accepts a single-digit hour", () => {
    expect(itemInstant("2026-09-06", "9:00")).toEqual(at(2026, 9, 6, 9, 0));
  });

  it("is null for a row the note left without a usable time", () => {
    expect(itemInstant("2026-08-31", "")).toBeNull();
    expect(itemInstant("2026-08-31", "整天")).toBeNull();
    expect(itemInstant("2026-08-31", "15:30–17:00")).toBeNull();
  });
});

describe("daysUntilTrip", () => {
  it("counts whole days regardless of the time of day", () => {
    expect(daysUntilTrip(at(2026, 8, 29, 1, 0), DAYS)).toBe(1);
    expect(daysUntilTrip(at(2026, 8, 29, 23, 0), DAYS)).toBe(1);
    expect(daysUntilTrip(at(2026, 7, 25), DAYS)).toBe(36);
  });

  it("is 0 once the trip has started", () => {
    expect(daysUntilTrip(at(2026, 8, 30, 6, 0), DAYS)).toBe(0);
    expect(daysUntilTrip(at(2026, 9, 1), DAYS)).toBe(0);
  });
});
