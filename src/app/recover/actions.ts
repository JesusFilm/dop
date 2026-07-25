"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/db";
import { setDeviceCookie } from "@/lib/device-cookie";
import { validateRecoveryCode } from "@/lib/recovery";
import {
  findCurrentSession,
  findSubmissionByDeviceToken,
  findSubmissionByRecoveryCode,
} from "@/lib/repository";
import { DEVICE_TOKEN_COOKIE } from "@/lib/submit";

import type { RecoveryFormState } from "./recovery-state";

/**
 * The recovery-code server action (§7.4, #8): restores a participant's own
 * return view on **any** device from the short code they were shown at submit.
 * Entirely self-service — an organizer is never involved and never sees a
 * request (#3).
 *
 * "Restoring the session" means adopting the entry's `deviceToken` as this
 * device's cookie, so every downstream surface keeps resolving the entry the one
 * owner-scoped way it already does ({@link findSubmissionByDeviceToken}) and
 * this action stays the only place that understands recovery codes. The original
 * phone keeps working — its cookie is untouched.
 *
 * **Not gated on the reveal boundary.** The §6 hard cutoff governs *writing* a
 * submission; restoring one is a read. Before the reveal a recovered
 * participant can still edit, after it they read who they're praying for —
 * which is exactly the case this exists for (§10 "different phone / cleared
 * cookie → enter recovery code").
 */

const NOT_OPEN_MESSAGE = "This isn't open yet. Please check with an organizer.";
const UNKNOWN_CODE_MESSAGE =
  "We couldn't find that code. Check the characters and try again, or find an organizer — they can help in person.";

export async function recoverAction(
  _prevState: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const db = getDatabase();

  const session = await findCurrentSession(db);
  if (!session) {
    return { error: NOT_OPEN_MESSAGE };
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(DEVICE_TOKEN_COOKIE)?.value;
  if (existingToken) {
    const own = await findSubmissionByDeviceToken(
      db,
      session.id,
      existingToken,
    );
    if (own) {
      // This device already holds its own entry, so there is nothing to
      // restore — and overwriting its cookie with another entry's token would
      // lose access to it. Show what it already has (§6). A *stale* cookie
      // whose entry is gone (purged, §8) falls through and recovers normally.
      redirect("/");
    }
  }

  const validation = validateRecoveryCode(formData.get("recoveryCode"));
  if (!validation.ok) {
    // An obvious typo — wrong length, or a character the generator never emits
    // — is rejected without a database round-trip.
    return { error: validation.error };
  }

  const submission = await findSubmissionByRecoveryCode(
    db,
    session.id,
    validation.code,
  );
  if (!submission) {
    // One message for "never existed" and "already purged" alike: neither the
    // participant nor a code-guesser learns which it was.
    return { error: UNKNOWN_CODE_MESSAGE };
  }

  await setDeviceCookie(submission.deviceToken);
  redirect("/");
}
