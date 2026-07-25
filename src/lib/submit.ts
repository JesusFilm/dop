/**
 * Pure helpers and locked copy for the participant submit flow (§7.1, #7, #13).
 * Kept free of Next.js, React, database, and Node built-in concerns so the copy,
 * validation, and reveal-cutoff logic unit-test with plain values **and** import
 * safely into the client submit screen. The credential generators that need
 * `node:crypto` live in the server-only {@link module:@/lib/tokens} so this
 * module never drags a Node built-in into the browser bundle.
 */

/**
 * The device cookie name (§6: one submission per `deviceToken`). The cookie
 * value is the opaque `generateDeviceToken` identifier (see `@/lib/tokens`);
 * the submit action writes it and the submit landing reads it to resolve the
 * return view.
 */
export const DEVICE_TOKEN_COOKIE = "dop_device";

/**
 * The locked submit-screen copy (§7.1, tone A warm). Held as data so the copy
 * is asserted by a test and changed in exactly one place — the surrounding
 * wording is deliberately warm so the required surname (#13) does not read as
 * formal.
 */
export const SUBMIT_COPY = {
  heading: "Share something to pray for",
  intro:
    "This morning we're praying for one another. Write down what's on your heart — one other person will carry it with you.",
  firstNameLabel: "First name",
  lastNameLabel: "Last name",
  requestLabel: "What would you like prayer for?",
  requestPlaceholder:
    "It doesn't need to be big or polished — a worry, a hope, someone you love, a decision you're facing.",
  chipsPrompt: "Not sure where to start? Tap one:",
  consent:
    "Just one person — the one you're paired with — will see your name and read this. It's never shown publicly, no one sees everyone's, and it's all deleted tomorrow.",
  button: "Share my request",
  /**
   * The status header for a visitor who has no entry and arrives at or after
   * the reveal — the §6/§10 hard cutoff ("late arrival … covered in person").
   * Leads that screen because it is the true thing about their situation; the
   * recovery-code offer sits underneath it (§7.3).
   */
  closedHeading: "Submissions have closed",
} as const;

/**
 * The "submissions close" fine print. Interpolated with the organizer-set
 * reveal label (#14) rather than a frozen time: `revealAt` is configurable and
 * every other surface derives its label from it, so freezing "11:00 on Monday"
 * here would silently lie for any other reveal time. Kept as a function (not a
 * `SUBMIT_COPY` constant) precisely because the value is dynamic.
 */
export function submissionsCloseLine(revealLabel: string): string {
  return `Submissions close at the reveal time (${revealLabel}).`;
}

/**
 * The past-tense counterpart, for a visitor who arrives after the hard cutoff
 * (§6): submissions are closed, so no new request can be added. Lives here with
 * {@link submissionsCloseLine} so both sides of the close boundary are worded in
 * one place, and takes the same organizer-set label (#14) rather than a frozen
 * time.
 */
export function submissionsClosedLine(revealLabel: string): string {
  return `Submissions closed at ${revealLabel}, so a new request can't be added now.`;
}

/** A starter chip: a warm topic label whose tap prefills a sentence starter. */
export interface StarterChip {
  /** The label shown on the chip (locked to §7.1). */
  label: string;
  /** The sentence starter dropped into the request field when tapped. */
  starter: string;
}

/**
 * The six optional starter chips (§7.1, tone C). Tapping a chip prefills a
 * gentle sentence starter into the request field so a blank box never stalls
 * someone; the labels are locked, the starters keep the warm tone.
 */
export const STARTER_CHIPS: readonly StarterChip[] = [
  { label: "Someone I love", starter: "Someone I love who needs prayer is " },
  { label: "A decision I'm facing", starter: "A decision I'm facing is " },
  {
    label: "Something I'm worried about",
    starter: "Something I'm worried about is ",
  },
  {
    label: "Something I'm thankful for",
    starter: "Something I'm thankful for is ",
  },
  { label: "My work", starter: "At work, I could use prayer for " },
  { label: "My health", starter: "For my health, please pray for " },
];

/** The raw, untrusted field values as they arrive from `FormData`. */
export interface RawSubmissionForm {
  firstName: unknown;
  lastName: unknown;
  request: unknown;
}

/** The cleaned, validated fields ready to persist. */
export interface SubmissionFields {
  firstName: string;
  lastName: string;
  request: string;
}

/** Per-field validation messages, keyed by the field that failed. */
export type SubmissionFieldErrors = Partial<
  Record<keyof SubmissionFields, string>
>;

export type ValidationResult =
  | { ok: true; value: SubmissionFields }
  | { ok: false; fieldErrors: SubmissionFieldErrors };

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Maximum trimmed lengths accepted for each field. Enforced server-side (the
 * authoritative boundary) so an unbounded body cannot flood the DB or the
 * partner's reveal view; the client `maxLength` attributes mirror these only as
 * a convenience. Sized generously for real names and a heartfelt paragraph.
 */
export const FIELD_MAX_LENGTHS = {
  name: 100,
  request: 2000,
} as const;

/**
 * Validates the submit form: first name, last name, and request are all
 * required (#13 — two separate required name fields; request required, §7.1)
 * and bounded in length ({@link FIELD_MAX_LENGTHS}). Trims each field, reports
 * every failing field at once, and returns the cleaned values on success.
 * Server-authoritative — the client `required`/`maxLength` attributes are a
 * convenience, not the boundary.
 */
export function validateSubmissionForm(
  raw: RawSubmissionForm,
): ValidationResult {
  const firstName = asTrimmedString(raw.firstName);
  const lastName = asTrimmedString(raw.lastName);
  const request = asTrimmedString(raw.request);

  const fieldErrors: SubmissionFieldErrors = {};
  if (!firstName) {
    fieldErrors.firstName = "Please enter your first name.";
  } else if (firstName.length > FIELD_MAX_LENGTHS.name) {
    fieldErrors.firstName = `Please keep your first name under ${FIELD_MAX_LENGTHS.name} characters.`;
  }
  if (!lastName) {
    fieldErrors.lastName = "Please enter your last name.";
  } else if (lastName.length > FIELD_MAX_LENGTHS.name) {
    fieldErrors.lastName = `Please keep your last name under ${FIELD_MAX_LENGTHS.name} characters.`;
  }
  if (!request) {
    fieldErrors.request = "Please write what you'd like prayer for.";
  } else if (request.length > FIELD_MAX_LENGTHS.request) {
    fieldErrors.request = `Please keep your request under ${FIELD_MAX_LENGTHS.request} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return { ok: true, value: { firstName, lastName, request } };
}

/**
 * Whether `now` is strictly before the reveal instant (close = reveal, §5/§6).
 * Submissions and edits are allowed only while this is true; at or after the
 * reveal the entry is locked. The app clock owns the sharp moment (§5), so this
 * is evaluated server-side against the organizer-set `revealAt`.
 */
export function isBeforeReveal(now: Date, revealAt: Date): boolean {
  return now.getTime() < revealAt.getTime();
}
