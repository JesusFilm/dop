import {
  deleteSessionData,
  findSessionsDueForPurge,
  type DataClient,
} from "@/lib/repository";

/**
 * The auto-purge job (§8.4, §10, #8): the next-morning delete of a session's
 * submissions.
 *
 * The scheduler is only a trigger — the **app's own clock owns the moment**, as
 * it does for the reveal (§5). Railway cron is best-effort and can drift, so
 * the job re-reads which sessions are actually past their `purgeAfter` instant
 * rather than trusting the fire time. That makes it safe to run on a coarse
 * schedule and safe to run twice: it is idempotent, a no-op when nothing is
 * due, and self-healing when a run is missed.
 *
 * Kept free of Next.js, process, and Prisma-construction concerns so it unit
 * tests against a fake {@link DataClient}, and goes through the sanctioned data
 * layer so the Privacy #3 boundary still holds — the job reads ids and counts,
 * never request content.
 */

/** What the job did to one session. */
export interface SessionPurgeResult {
  sessionId: string;
  name: string;
  submissionsDeleted: number;
  groupsDeleted: number;
}

/** The job's outcome, shaped for a log line and the operator's verification. */
export interface PurgeReport {
  /** The app-clock instant the run used to decide what was due. */
  ranAt: Date;
  /** Total submissions removed across every due session. */
  submissionsDeleted: number;
  sessions: SessionPurgeResult[];
}

/**
 * Deletes the submissions (and their derived groups) of every session whose
 * `purgeAfter` instant has passed. Sessions not yet due are left untouched.
 */
export async function purgeDueSessions(
  client: DataClient,
  now: Date = new Date(),
): Promise<PurgeReport> {
  const due = await findSessionsDueForPurge(client, now);

  const sessions: SessionPurgeResult[] = [];
  for (const session of due) {
    const deleted = await deleteSessionData(client, session.id);
    sessions.push({
      sessionId: session.id,
      name: session.name,
      submissionsDeleted: deleted.submissionsDeleted,
      groupsDeleted: deleted.groupsDeleted,
    });
  }

  return {
    ranAt: now,
    submissionsDeleted: sessions.reduce(
      (total, session) => total + session.submissionsDeleted,
      0,
    ),
    sessions,
  };
}
