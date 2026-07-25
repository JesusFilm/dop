"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/db";
import {
  createSubmission,
  findCurrentSession,
  findSubmissionByDeviceToken,
  updateSubmission,
} from "@/lib/repository";
import { generateDeviceToken, generateRecoveryCode } from "@/lib/tokens";
import {
  DEVICE_TOKEN_COOKIE,
  isBeforeReveal,
  validateSubmissionForm,
} from "@/lib/submit";

import type { SubmitFormState } from "./submit-state";

/**
 * Server actions for the participant submit flow (§7.1, §6, #7, #13):
 * `submitAction` records a new entry and sets the device cookie (one submission
 * per `deviceToken`); `editAction` updates a returning participant's entry
 * before the reveal. Both close hard at the reveal instant by the app clock
 * (§5/§6) — the app clock, never the client, owns that cutoff.
 */

const CLOSED_MESSAGE =
  "Submissions have closed — come back at the reveal time.";
const NOT_OPEN_MESSAGE = "This isn't open yet. Please check with an organizer.";
const SAVE_ERROR_MESSAGE =
  "Something went wrong saving your request. Please try again.";

/** Two days covers the open→reveal window and the next-morning return (§10). */
const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 2;

/**
 * How many times to regenerate the recovery code and retry a create when the
 * insert loses the `(sessionId, recoveryCode)` unique race. A collision is
 * astronomically rare (6 chars over a 32-char alphabet), so a small ceiling is
 * ample and bounds the loop.
 */
const MAX_RECOVERY_CODE_ATTEMPTS = 5;

async function setDeviceCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Prisma raises P2002 when a unique constraint is violated. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * The fields/constraint the P2002 references, as a flat list of strings.
 * Prisma reports `meta.target` as a field-name array (`["sessionId",
 * "deviceToken"]`) or, depending on adapter, the constraint name string
 * (`"submissions_sessionId_recoveryCode_key"`); both forms carry the field
 * name, so callers match by substring. Empty when the adapter omits `target`.
 */
function uniqueViolationTarget(error: unknown): string[] {
  const target = (error as { meta?: { target?: unknown } })?.meta?.target;
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === "string");
  }
  return typeof target === "string" ? [target] : [];
}

function targetMentions(error: unknown, field: string): boolean {
  return uniqueViolationTarget(error).some((entry) => entry.includes(field));
}

/**
 * Records a new submission and sets the device cookie (§6, §7.1). Enforces one
 * submission per `deviceToken`: a device that already has an entry is bounced
 * to the return view rather than creating a second, and the
 * `(sessionId, deviceToken)` unique index is the concurrency backstop.
 * Submissions hard-close at the reveal instant by app clock (§5/§6). A
 * `recoveryCode` is generated and persisted here (schema-required, #8); the
 * confirmation screen that reveals it lands in a later ticket (§7.2).
 */
export async function submitAction(
  _prevState: SubmitFormState,
  formData: FormData,
): Promise<SubmitFormState> {
  const db = getDatabase();

  const session = await findCurrentSession(db);
  if (!session) {
    return { error: NOT_OPEN_MESSAGE };
  }

  if (!isBeforeReveal(new Date(), session.revealAt)) {
    return { error: CLOSED_MESSAGE };
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(DEVICE_TOKEN_COOKIE)?.value;
  if (existingToken) {
    const existing = await findSubmissionByDeviceToken(
      db,
      session.id,
      existingToken,
    );
    if (existing) {
      // One submission per device (§6): this phone already has an entry, so
      // send them to the return view instead of writing a second.
      redirect("/");
    }
  }

  const validation = validateSubmissionForm({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    request: formData.get("request"),
  });
  if (!validation.ok) {
    return { error: null, fieldErrors: validation.fieldErrors };
  }

  // Reuse the device's existing cookie value if it has one (e.g. a prior
  // attempt that never persisted), otherwise mint a fresh token.
  const deviceToken = existingToken ?? generateDeviceToken();

  // `Submission` carries two unique indexes — (sessionId, deviceToken) and
  // (sessionId, recoveryCode) — so a P2002 must be disambiguated. A deviceToken
  // race means this phone already has an entry: bounce to the return view. A
  // recoveryCode collision means the row was NEVER written, so we regenerate
  // the code and retry rather than silently dropping the submission (which the
  // old "any P2002 → already-submitted" path did).
  for (let attempt = 1; attempt <= MAX_RECOVERY_CODE_ATTEMPTS; attempt += 1) {
    try {
      await createSubmission(db, {
        sessionId: session.id,
        deviceToken,
        recoveryCode: generateRecoveryCode(),
        firstName: validation.value.firstName,
        lastName: validation.value.lastName,
        request: validation.value.request,
      });
      break;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        return { error: SAVE_ERROR_MESSAGE };
      }

      // Definite deviceToken race → already-submitted return view (§6).
      if (targetMentions(error, "deviceToken")) {
        await setDeviceCookie(deviceToken);
        redirect("/");
      }

      // A recoveryCode collision, or an unknown target that still has a retry
      // left: regenerate and try again. When the target is unknown, a fresh
      // UUID deviceToken cannot realistically collide, so a retry is the safe
      // reading; a persistent reused-token collision is resolved after the loop.
      const retriable =
        targetMentions(error, "recoveryCode") ||
        uniqueViolationTarget(error).length === 0;
      if (retriable && attempt < MAX_RECOVERY_CODE_ATTEMPTS) {
        continue;
      }

      // Retries exhausted with an unknown target: if we reused an existing
      // cookie token this is most likely a genuine device race, so show the
      // return view; otherwise surface the generic error.
      if (retriable && existingToken) {
        await setDeviceCookie(deviceToken);
        redirect("/");
      }
      return { error: SAVE_ERROR_MESSAGE };
    }
  }

  await setDeviceCookie(deviceToken);
  redirect("/");
}

/**
 * Updates a returning participant's own entry before the reveal (§6: "returning
 * on the same phone before the reveal time → name/request editable"). The entry
 * is resolved owner-scoped from this device's cookie; edits hard-close at the
 * reveal instant by app clock (§5/§6). Name (#13) and request are editable; the
 * device token and recovery code are never touched.
 */
export async function editAction(
  _prevState: SubmitFormState,
  formData: FormData,
): Promise<SubmitFormState> {
  const db = getDatabase();

  const session = await findCurrentSession(db);
  if (!session) {
    return { error: NOT_OPEN_MESSAGE };
  }

  const cookieStore = await cookies();
  const deviceToken = cookieStore.get(DEVICE_TOKEN_COOKIE)?.value;
  if (!deviceToken) {
    return { error: "We couldn't find your entry on this device." };
  }

  const existing = await findSubmissionByDeviceToken(
    db,
    session.id,
    deviceToken,
  );
  if (!existing) {
    return { error: "We couldn't find your entry on this device." };
  }

  if (!isBeforeReveal(new Date(), session.revealAt)) {
    return {
      error: "Your request is locked in now — the reveal time has passed.",
    };
  }

  const validation = validateSubmissionForm({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    request: formData.get("request"),
  });
  if (!validation.ok) {
    return { error: null, fieldErrors: validation.fieldErrors };
  }

  await updateSubmission(db, {
    id: existing.id,
    firstName: validation.value.firstName,
    lastName: validation.value.lastName,
    request: validation.value.request,
  });

  redirect("/");
}
