"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/db";
import { createSession, findSessionBySetupPath } from "@/lib/repository";
import { buildSessionInput, isConfiguredSetupPath } from "@/lib/setup";

export interface CreateSessionState {
  error: string | null;
}

/**
 * Create-once server action for the organizer setup page (§7.5). Bound to the
 * unguessable `path` at render time; the extra `formData` carries the three
 * wall-clock inputs. On success it redirects back to the setup page, which then
 * renders the read-only view (QR + locked times + live count). There is no
 * counterpart delete/reset action — create-once is enforced here and by the
 * `setupPath` unique constraint, protecting live requests (§7.5).
 */
export async function createSessionAction(
  path: string,
  _prevState: CreateSessionState,
  formData: FormData,
): Promise<CreateSessionState> {
  if (!isConfiguredSetupPath(path)) {
    return { error: "This setup link is not valid." };
  }

  const setupUrl = `/setup/${path}`;
  const db = getDatabase();

  // Create-once: never create a second session at this path. A concurrent race
  // is caught below by the unique-constraint fallback.
  const existing = await findSessionBySetupPath(db, path);
  if (existing) {
    redirect(setupUrl);
  }

  let input;
  try {
    input = buildSessionInput(
      {
        date: String(formData.get("date") ?? ""),
        openTime: String(formData.get("openTime") ?? ""),
        revealTime: String(formData.get("revealTime") ?? ""),
      },
      path,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not read the times you entered.",
    };
  }

  try {
    await createSession(db, input);
  } catch (error) {
    // The `setupPath` unique constraint is the create-once backstop: a
    // concurrent create already won, so treat this as success and show the
    // read-only view rather than surfacing a database error.
    if (isUniqueViolation(error)) {
      redirect(setupUrl);
    }
    return { error: "Could not create the session. Please try again." };
  }

  redirect(setupUrl);
}

/** Prisma raises P2002 when a unique constraint (here `setupPath`) is hit. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
