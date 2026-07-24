import type { CreateSessionInput } from "@/lib/repository";
import { computePurgeAfter, parseWallClock } from "@/lib/time";

/**
 * Pure helpers for the organizer setup page (§7.5, #9, #14): turning the create
 * form's wall-clock values into a create-session input, deriving the URL the QR
 * encodes, and resolving the app origin behind Railway's proxy. Kept free of
 * Next.js and database concerns so they unit-test with plain values.
 */

/** Fixed IANA zone the organizer's inputs are interpreted in; no picker (#14). */
export const SETUP_TIME_ZONE = "Pacific/Auckland";

/** Human-readable event name for the single session (not a form field). */
export const SESSION_NAME = "Day of Prayer";

/** The three wall-clock values the create form collects (§7.5). */
export interface SetupFormValues {
  /** `<input type="date">` value, `YYYY-MM-DD`. */
  date: string;
  /** Open time, `<input type="time">` value `HH:MM`. */
  openTime: string;
  /** Reveal time (close = reveal, one instant), `HH:MM`. */
  revealTime: string;
}

/**
 * Builds the {@link CreateSessionInput} for the one session from the form's
 * wall-clock values, interpreting them in `timeZone`. `opensAt`/`revealAt` are
 * absolute instants; `purgeAfter` is the next morning (§8). Throws with a
 * friendly message when the reveal is not strictly after the open time, since
 * close = reveal must be a real window (§5).
 */
export function buildSessionInput(
  form: SetupFormValues,
  setupPath: string,
  timeZone: string = SETUP_TIME_ZONE,
): CreateSessionInput {
  const opensAt = parseWallClock(form.date, form.openTime, timeZone);
  const revealAt = parseWallClock(form.date, form.revealTime, timeZone);

  if (revealAt.getTime() <= opensAt.getTime()) {
    throw new Error("Reveal time must be after the open time.");
  }

  return {
    name: SESSION_NAME,
    setupPath,
    timeZone,
    opensAt,
    revealAt,
    purgeAfter: computePurgeAfter(form.date, timeZone),
  };
}

/**
 * Whether a requested setup-page path is the configured unguessable one. The
 * expected slug lives in an env var (`ORGANIZER_SETUP_PATH`), never in source,
 * so the page's location stays unguessable and only the one configured path can
 * ever create the single session (§7.5). Any mismatch or unset expectation is
 * denied — the route 404s rather than exposing a create form at guessed paths.
 */
export function isSetupPathAllowed(
  path: string,
  expected: string | undefined,
): boolean {
  return (
    typeof expected === "string" && expected.length > 0 && path === expected
  );
}

/**
 * Whether `path` is the setup slug configured for this deployment. The single
 * place `ORGANIZER_SETUP_PATH` is read, so the setup route, its create action,
 * and the count endpoint all authorize the path the same way (§7.5).
 */
export function isConfiguredSetupPath(path: string): boolean {
  return isSetupPathAllowed(path, process.env.ORGANIZER_SETUP_PATH);
}

/**
 * The URL a scanned QR opens — the app origin root, where the submit landing
 * lives (§1). Normalized to a single trailing slash.
 */
export function submissionUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/`;
}

/**
 * Resolves the public origin (`scheme://host`) from request headers, preferring
 * the values Railway's proxy forwards. Returns null when no host header is
 * present so the caller can fall back to a configured URL. `get` is a plain
 * header accessor so this stays unit-testable.
 */
export function originFromHeaders(
  get: (name: string) => string | null,
): string | null {
  const host = get("x-forwarded-host") ?? get("host");
  if (!host) {
    return null;
  }

  const forwardedProto = get("x-forwarded-proto");
  const proto =
    forwardedProto ?? (/^localhost(:|$)/.test(host) ? "http" : "https");

  return `${proto}://${host}`;
}
