/**
 * Wall-clock ↔ UTC-instant conversion for the fixed IANA zone the organizer's
 * inputs are entered in (Pacific/Auckland, #14). The organizer types a calendar
 * date and a wall-clock time; we store absolute UTC instants (timestamptz) so
 * the app clock owns the sharp reveal moment (§5) regardless of server locale.
 *
 * The conversion is DST-correct: it asks the runtime, via {@link Intl}, what
 * offset the named zone had at the target instant, so July (NZST, UTC+12) and
 * January (NZDT, UTC+13) both resolve correctly with no hardcoded offset.
 */

/** Hour of the morning after the event that the auto-purge runs (§10). */
export const PURGE_HOUR = 6;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Parses and range-validates an `<input type="date">` value (`YYYY-MM-DD`) into
 * its calendar parts. Single-sources the date-format error message shared by
 * {@link parseWallClock} and {@link computePurgeAfter}.
 */
function parseDateParts(dateValue: string): {
  year: number;
  month: number;
  day: number;
} {
  const dateMatch = DATE_PATTERN.exec(dateValue);
  if (!dateMatch) {
    throw new Error(`Invalid date "${dateValue}" — expected YYYY-MM-DD.`);
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12 || day < 1) {
    throw new Error(`Invalid date "${dateValue}".`);
  }
  // Reject impossible days for the month (e.g. 31 Apr, 30 Feb) rather than
  // letting Date silently roll them into the next month, which would create a
  // session for a different calendar date than the organizer entered. Day 0 of
  // the next month is the last day of this one, so this is leap-year correct.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    throw new Error(`Invalid date "${dateValue}".`);
  }
  return { year, month, day };
}

/**
 * The offset, in milliseconds, that `timeZone` was at the given absolute
 * instant (positive east of UTC). Derived by formatting the instant in the zone
 * and comparing the wall-clock reading back against UTC.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      read[part.type] = Number(part.value);
    }
  }

  const asUtc = Date.UTC(
    read.year,
    read.month - 1,
    read.day,
    read.hour === 24 ? 0 : read.hour,
    read.minute,
    read.second,
  );
  return asUtc - instant.getTime();
}

/**
 * Converts a wall-clock date+time in `timeZone` to its absolute UTC instant.
 * The wall-clock reading is treated as if it were UTC, then shifted by the
 * zone's offset at that moment. One correction pass is DST-correct for every
 * time except the ~1h/year spring-forward gap, which our 09:00/11:00 inputs
 * never land in.
 */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset = timeZoneOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset);
}

/**
 * Parses an `<input type="date">` value (`YYYY-MM-DD`) and an
 * `<input type="time">` value (`HH:MM`), interpreted as a wall clock in
 * `timeZone`, into an absolute UTC instant. Throws on malformed or
 * out-of-range input so the setup form can surface a friendly error.
 */
export function parseWallClock(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): Date {
  const { year, month, day } = parseDateParts(dateValue);

  const timeMatch = TIME_PATTERN.exec(timeValue);
  if (!timeMatch) {
    throw new Error(`Invalid time "${timeValue}" — expected HH:MM.`);
  }
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid time "${timeValue}".`);
  }

  return zonedWallClockToUtc(year, month, day, hour, minute, timeZone);
}

/**
 * The next-morning purge instant for a given event date: the following calendar
 * day at {@link PURGE_HOUR} wall-clock in `timeZone` (§8, §10). The setup-page
 * count reads 0 once this fires, doubling as the purge-verification view.
 */
export function computePurgeAfter(dateValue: string, timeZone: string): Date {
  const { year, month, day } = parseDateParts(dateValue);

  // Let Date normalize month/day overflow (e.g. 31 Jul + 1 → 1 Aug).
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedWallClockToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    PURGE_HOUR,
    0,
    timeZone,
  );
}

/**
 * Renders an absolute instant back in `timeZone` for the read-only setup view's
 * locked-in times (§7.5), e.g. "Mon, 27 Jul 2026, 11:00".
 */
export function formatZonedDateTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/**
 * Renders just the wall-clock time of an instant in `timeZone`, e.g. "09:41".
 * Date-free on purpose: the event is a single day, so the calendar date would be
 * noise. 24-hour, matching {@link formatZonedDateTime}, so there is no am/pm
 * ambiguity. Two surfaces want it — the confirmation clock badge (§7.2) and the
 * return view's "Shared at …" label (§7.3).
 */
export function formatZonedTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/**
 * The instant as the §7.2 "11:00 on Monday" phrase. The event is a single day,
 * so the weekday reads more naturally than a full date in the thank-you copy.
 * Both parts are resolved in `timeZone`, so an instant that is still Sunday in
 * UTC correctly reads as Monday for an Auckland session.
 */
export function formatZonedWeekdayTime(
  instant: Date,
  timeZone: string,
): string {
  const weekday = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    weekday: "long",
  }).format(instant);
  return `${formatZonedTime(instant, timeZone)} on ${weekday}`;
}
