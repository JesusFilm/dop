import { describe, expect, it } from "vitest";

import {
  computePurgeAfter,
  formatZonedDateTime,
  formatZonedTime,
  formatZonedWeekdayTime,
  parseWallClock,
  PURGE_HOUR,
} from "@/lib/time";

const AUCKLAND = "Pacific/Auckland";

describe("parseWallClock", () => {
  it("converts a Pacific/Auckland wall-clock date+time to a UTC instant (NZST, July)", () => {
    // Monday's config: open 09:00 / reveal 11:00 Pacific/Auckland. July is NZST
    // (UTC+12, no DST), so 09:00 local = 21:00 UTC the previous day (#14, §5).
    expect(parseWallClock("2026-07-27", "09:00", AUCKLAND)).toEqual(
      new Date("2026-07-26T21:00:00.000Z"),
    );
    expect(parseWallClock("2026-07-27", "11:00", AUCKLAND)).toEqual(
      new Date("2026-07-26T23:00:00.000Z"),
    );
  });

  it("respects daylight saving (NZDT, January = UTC+13)", () => {
    // In January NZ is on NZDT (UTC+13), so 09:00 local = 20:00 UTC prev day.
    expect(parseWallClock("2027-01-01", "09:00", AUCKLAND)).toEqual(
      new Date("2026-12-31T20:00:00.000Z"),
    );
  });

  it("rejects a malformed date", () => {
    expect(() => parseWallClock("27-07-2026", "09:00", AUCKLAND)).toThrow(
      /date/i,
    );
  });

  it("rejects an impossible day-of-month instead of silently rolling it over", () => {
    // April has 30 days and Feb 2026 has 28; without a days-in-month check these
    // would roll into the next month (30 Apr / 2 Mar), creating a session for a
    // different calendar date than the organizer entered.
    expect(() => parseWallClock("2026-04-31", "09:00", AUCKLAND)).toThrow(
      /date/i,
    );
    expect(() => parseWallClock("2026-02-30", "09:00", AUCKLAND)).toThrow(
      /date/i,
    );
    // Leap-year correct: 29 Feb 2028 is valid, 29 Feb 2026 is not.
    expect(() => parseWallClock("2028-02-29", "09:00", AUCKLAND)).not.toThrow();
    expect(() => parseWallClock("2026-02-29", "09:00", AUCKLAND)).toThrow(
      /date/i,
    );
  });

  it("rejects a malformed time", () => {
    expect(() => parseWallClock("2026-07-27", "9am", AUCKLAND)).toThrow(
      /time/i,
    );
  });

  it("rejects an out-of-range time", () => {
    expect(() => parseWallClock("2026-07-27", "25:00", AUCKLAND)).toThrow(
      /time/i,
    );
  });
});

describe("computePurgeAfter", () => {
  it("is the morning after the event date at PURGE_HOUR in the zone", () => {
    // Event 2026-07-27 → purge 2026-07-28 06:00 NZST = 2026-07-27T18:00:00Z.
    expect(PURGE_HOUR).toBe(6);
    expect(computePurgeAfter("2026-07-27", AUCKLAND)).toEqual(
      new Date("2026-07-27T18:00:00.000Z"),
    );
  });

  it("rolls into the next month correctly", () => {
    // Event 2026-07-31 → purge 2026-08-01 06:00 NZST = 2026-07-31T18:00:00Z.
    expect(computePurgeAfter("2026-07-31", AUCKLAND)).toEqual(
      new Date("2026-07-31T18:00:00.000Z"),
    );
  });
});

describe("formatZonedDateTime", () => {
  it("renders the instant back in the zone's wall clock", () => {
    const formatted = formatZonedDateTime(
      new Date("2026-07-26T23:00:00.000Z"),
      AUCKLAND,
    );
    // 11:00 on Mon 27 Jul in Auckland.
    expect(formatted).toMatch(/11:00/);
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/Jul/i);
  });
});

describe("formatZonedTime", () => {
  it("renders just the wall-clock time for the clock badge (§7.2)", () => {
    // 2026-07-26T23:00Z is 11:00 Monday in Auckland (NZST, UTC+12).
    expect(
      formatZonedTime(new Date("2026-07-26T23:00:00.000Z"), AUCKLAND),
    ).toBe("11:00");
  });

  it("uses a 24-hour clock so 14:30 never reads as 2:30", () => {
    expect(
      formatZonedTime(new Date("2026-07-27T02:30:00.000Z"), AUCKLAND),
    ).toBe("14:30");
  });
});

describe("formatZonedWeekdayTime", () => {
  it("reads as the §7.2 “11:00 on Monday” phrase", () => {
    expect(
      formatZonedWeekdayTime(new Date("2026-07-26T23:00:00.000Z"), AUCKLAND),
    ).toBe("11:00 on Monday");
  });

  it("names the weekday in the session's zone, not UTC", () => {
    // 2026-07-26T23:00Z is still Sunday in UTC but already Monday in Auckland.
    expect(
      formatZonedWeekdayTime(new Date("2026-07-26T23:00:00.000Z"), "UTC"),
    ).toBe("23:00 on Sunday");
  });
});
