/**
 * Pure helpers and locked copy for recovery-code entry (§7.4, #8) — the
 * self-service path that restores a participant's return view on any device.
 *
 * Browser-safe by design: the code *alphabet* lives here so both the
 * server-only generator ({@link module:@/lib/tokens}, which needs
 * `node:crypto`) and the client entry form agree on what a valid code looks
 * like, without dragging a Node built-in into the client bundle.
 */

/**
 * The alphabet a recovery code is drawn from. Deliberately omits the lookalike
 * pairs 0/O and 1/I so a code survives being read off a screenshot — which also
 * means a submitted code containing one of them was definitely mistyped and can
 * be rejected before any database lookup.
 */
export const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** How many characters a recovery code has (#8). */
export const RECOVERY_CODE_LENGTH = 6;

/**
 * The locked recovery-entry copy: the graceful no-cookie/no-code message (§7.3)
 * and the form's own labels (§7.4). Held as data so the wording is asserted by a
 * test and changed in one place. Self-service throughout — an organizer is the
 * last resort, never a lookup path, because they must never see requests (#3).
 */
export const RECOVERY_COPY = {
  heading: "You're probably on a different phone",
  body: "Your request is safe — this phone just doesn't have it. Enter the recovery code from your confirmation screenshot to pick up where you left off, or find an organizer if you can't.",
  label: "Recovery code",
  hint: `${RECOVERY_CODE_LENGTH} letters and numbers, from the screen you saw after sharing your request.`,
  button: "Restore my request",
  pending: "Restoring…",
  /** The link label offered on pre-reveal surfaces that show the submit form. */
  linkLabel: "Already shared your request on another phone?",
  /** Returns from the standalone recovery page to the participant landing. */
  backLabel: "Back",
  /**
   * Shown when the phone asking to recover already holds its own entry: there
   * is nothing to restore, and adopting another entry's token would cost them
   * access to their own.
   */
  alreadyOnThisPhone:
    "This phone already has a request on it — you're all set. Head back to see it.",
} as const;

export type RecoveryCodeResult =
  { ok: true; code: string } | { ok: false; error: string };

/**
 * Cleans a typed recovery code into the canonical form the generator produces:
 * upper-case, with the spaces and dashes people add when reading a code off a
 * screenshot removed. Non-string input normalizes to `""`.
 */
export function normalizeRecoveryCode(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const ALPHABET_SET = new Set(RECOVERY_ALPHABET);

/**
 * Validates a typed recovery code (§7.4). Normalizes first, then checks the
 * length and that every character is one the generator could have produced —
 * so an obvious typo gets an immediate, honest message instead of a database
 * round-trip and a "we couldn't find that code" that reads like the entry is
 * gone. A well-formed code that simply doesn't exist is the caller's concern.
 *
 * The sole authority on what a code may look like: the entry form deliberately
 * carries no browser `pattern`, so nothing on the client can reject a typing
 * this would have accepted.
 */
export function validateRecoveryCode(raw: unknown): RecoveryCodeResult {
  const code = normalizeRecoveryCode(raw);

  if (!code) {
    return { ok: false, error: "Please enter your recovery code." };
  }

  const wellFormed =
    code.length === RECOVERY_CODE_LENGTH &&
    [...code].every((character) => ALPHABET_SET.has(character));

  if (!wellFormed) {
    return {
      ok: false,
      error: `That doesn't look like a recovery code — it's ${RECOVERY_CODE_LENGTH} letters and numbers. Check it and try again.`,
    };
  }

  return { ok: true, code };
}
