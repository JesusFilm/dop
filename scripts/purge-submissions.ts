import { disconnectDatabase, getDatabase } from "../src/lib/db";
import { purgeDueSessions } from "../src/lib/purge";

/**
 * Entry point for the auto-purge job (§8.4, §10, #8) — the Railway cron
 * service's start command (`pnpm purge`), and the same command an organizer
 * runs by hand if the cron does not fire (see README, "Auto-purge").
 *
 * It only deletes sessions whose `purgeAfter` instant has already passed, so it
 * is safe to run on a coarse schedule, safe to re-run, and a no-op when nothing
 * is due. Exits non-zero on failure so a failed cron run is visible in Railway.
 */
async function main() {
  try {
    const report = await purgeDueSessions(getDatabase());

    if (report.sessions.length === 0) {
      console.log(
        `Auto-purge: nothing due at ${report.ranAt.toISOString()} — no sessions past their purge time.`,
      );
      return;
    }

    for (const session of report.sessions) {
      console.log(
        `Auto-purge: session ${session.sessionId} — deleted ${session.submissionsDeleted} submission(s), ${session.groupsDeleted} group(s).`,
      );
    }
    console.log(
      `Auto-purge: complete at ${report.ranAt.toISOString()} — ${report.submissionsDeleted} submission(s) deleted across ${report.sessions.length} session(s). Verify on the setup page: the count reads 0.`,
    );
  } catch (error) {
    console.error("Auto-purge failed", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void main();
