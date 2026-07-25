/**
 * The app-clock reveal gate (§5, #20). The organizer-set `revealAt` instant is
 * the single sharp boundary: submissions hard-close at it (see
 * {@link module:@/lib/submit.isBeforeReveal}) and reveal/partner content is
 * served only once the app clock reaches it. The scheduler (Railway cron) is a
 * compute trigger only — never the source of this boundary — so every surface
 * decides "is it reveal time yet?" against the app's own clock via these pure
 * helpers.
 *
 * Kept free of Next.js/React/DB/Node concerns so it unit-tests with plain
 * values and imports safely into both server routes and the client countdown.
 */

import { isBeforeReveal } from "@/lib/submit";

/**
 * Whether reveal/partner content may be served: true once the app clock reaches
 * the reveal instant (close = reveal, so the boundary is inclusive — §5). The
 * exact complement of {@link isBeforeReveal}, derived from it so the reveal
 * boundary is defined in exactly one place. Before this is true, callers show
 * the countdown ({@link msUntilReveal}); after, the partner view (#9).
 */
export function isRevealOpen(now: Date, revealAt: Date): boolean {
  return !isBeforeReveal(now, revealAt);
}

/**
 * Milliseconds remaining until the reveal, clamped at zero (never negative).
 * Computed server-side against the app clock, then handed to the client
 * countdown as the authoritative anchor so a skewed phone clock cannot move the
 * displayed reveal moment.
 */
export function msUntilReveal(now: Date, revealAt: Date): number {
  return Math.max(0, revealAt.getTime() - now.getTime());
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/**
 * Renders a remaining-milliseconds duration as a countdown label: `H:MM:SS`
 * once an hour or more remains, otherwise `M:SS` (the hours segment is dropped
 * so a two-hour window doesn't lead with a lonely `0:`). Partial seconds round
 * **up** so the label reads `0:01` — not `0:00` — while any time is still left,
 * and clamps to `0:00` at and past the reveal instant. Pure, so the tick
 * formatting is asserted without a fake clock.
 */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND));

  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  );
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  const twoDigit = (value: number) => value.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${twoDigit(minutes)}:${twoDigit(seconds)}`;
  }
  return `${minutes}:${twoDigit(seconds)}`;
}
