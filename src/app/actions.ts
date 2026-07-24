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

/** Two days covers the open→reveal window and the next-morning return (§10). */
const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 2;

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

  try {
    await createSubmission(db, {
      sessionId: session.id,
      deviceToken,
      recoveryCode: generateRecoveryCode(),
      firstName: validation.value.firstName,
      lastName: validation.value.lastName,
      request: validation.value.request,
    });
  } catch (error) {
    // A concurrent submit from the same device already won the
    // (sessionId, deviceToken) unique index — treat as already-submitted and
    // show the return view rather than surfacing a database error (§6).
    if (isUniqueViolation(error)) {
      await setDeviceCookie(deviceToken);
      redirect("/");
    }
    return {
      error: "Something went wrong saving your request. Please try again.",
    };
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
