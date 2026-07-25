// Loads DATABASE_URL from `.env` when a human runs this by hand (the missed-cron
// fallback). No-ops on Railway, which has no `.env` and whose injected variables
// dotenv never overwrites.
import "dotenv/config";

import {
  describeDatabaseTarget,
  disconnectDatabase,
  getDatabase,
} from "../src/lib/db";
import { purgeDueSessions } from "../src/lib/purge";

/**
 * Entry point for the auto-purge job (§8.4, §10, #8) — the Railway cron
 * service's start command (`pnpm purge`), and the same command an organizer
 * runs by hand if the cron does not fire (see README, "Auto-purge").
 *
 * It only deletes sessions whose `purgeAfter` instant has already passed, so it
 * is safe to run on a coarse schedule, safe to re-run, and a no-op when nothing
 * is due. Exits non-zero on failure so a failed cron run is visible in Railway.
 *
 * Every line names the database it acted on. Run by hand, this command picks up
 * whatever `DATABASE_URL` the operator's `.env` holds — which the repo tells
 * developers to point at local Postgres — so "nothing due" would otherwise read
 * as "the data is gone" when it really means "wrong database". The target is the
 * operator's check that they purged the event's database and not their laptop's.
 */
async function main() {
  const target = describeDatabaseTarget(process.env.DATABASE_URL);

  try {
    const report = await purgeDueSessions(getDatabase());

    if (report.sessions.length === 0) {
      console.log(
        `Auto-purge: nothing due at ${report.ranAt.toISOString()} in ${target} — no sessions past their purge time. If you expected a purge, check that ${target} is the event's database.`,
      );
      return;
    }

    for (const session of report.sessions) {
      console.log(
        `Auto-purge: "${session.name}" (${session.sessionId}) — deleted ${session.submissionsDeleted} submission(s), ${session.groupsDeleted} group(s).`,
      );
    }
    console.log(
      `Auto-purge: complete at ${report.ranAt.toISOString()} in ${target} — ${report.submissionsDeleted} submission(s) deleted across ${report.sessions.length} session(s). Verify on the setup page: the count reads 0.`,
    );
  } catch (error) {
    console.error(`Auto-purge failed against ${target}`, error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void main();
