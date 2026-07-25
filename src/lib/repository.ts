import type {
  Group,
  Prisma,
  PrismaClient,
  Session,
  Submission,
} from "@/generated/prisma/client";

import { formGroups, shuffle, type RandomSource } from "@/lib/pairing";
import { isBeforeReveal } from "@/lib/submit";

/**
 * The sanctioned data-access layer for the whole app.
 *
 * Privacy invariant (Privacy #3, spec §3): requests are retrievable **only
 * per-assignment** — a member fetching their own group via
 * {@link getGroupAssignment}. This module deliberately exposes **no** function
 * that lists or returns every request for a session; `countSubmissions`
 * returns a bare number and never request content. Route handlers must go
 * through this module rather than reaching for the raw Prisma client, so the
 * "no all-requests path" guarantee holds at the application's data boundary.
 */

/**
 * The subset of the Prisma client this layer depends on. Narrowing the surface
 * keeps the functions unit-testable with a fake and documents exactly which
 * delegate operations the data-access boundary is allowed to perform. The real
 * {@link PrismaClient} satisfies it.
 */
export type DataClient = Pick<PrismaClient, "session" | "submission" | "group">;

export interface CreateSessionInput {
  name: string;
  /** Unique/unguessable slug for the organizer setup page (#9). */
  setupPath: string;
  /** Absolute instant for the organizer-set open time (#14). */
  opensAt: Date;
  /** Absolute instant for the reveal (close = reveal, one instant) (#14). */
  revealAt: Date;
  /** Absolute instant for the next-morning purge. */
  purgeAfter: Date;
  /**
   * IANA zone the organizer's wall-clock inputs were entered in. Defaults to
   * the fixed "Pacific/Auckland" (#14); there is no timezone picker.
   */
  timeZone?: string;
}

export interface UpdateSubmissionInput {
  /** The submission id, located owner-scoped via the caller's own cookie (§6). */
  id: string;
  /** Required (#13). */
  firstName: string;
  /** Required (#13). */
  lastName: string;
  request: string;
}

export interface CreateSubmissionInput {
  sessionId: string;
  /** Cookie value; one submission per device per session (§6). */
  deviceToken: string;
  /** Short bearer credential shown once at submit (#8). */
  recoveryCode: string;
  /** Required (#13). */
  firstName: string;
  /** Required (#13). */
  lastName: string;
  request: string;
}

/** One member of a group as seen from within that group. */
export interface GroupMember {
  submissionId: string;
  firstName: string;
  lastName: string;
  request: string;
  /** True for the requesting member's own submission. */
  isSelf: boolean;
}

export interface GroupAssignment {
  groupId: string;
  members: GroupMember[];
}

/** Creates the single session (organizer setup, create-once, §7.5). */
export function createSession(
  client: DataClient,
  input: CreateSessionInput,
): Promise<Session> {
  return client.session.create({
    data: {
      name: input.name,
      setupPath: input.setupPath,
      opensAt: input.opensAt,
      revealAt: input.revealAt,
      purgeAfter: input.purgeAfter,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
  });
}

/**
 * The single current session (submit landing, §7.1). The app is single-session
 * (§3): a scanned QR opens the app root with no setup path, so this resolves
 * "the one session" — the most recently created, tolerating the reuse seam
 * where a future event inserts another Session. Null before setup has run.
 */
export function findCurrentSession(
  client: DataClient,
): Promise<Session | null> {
  return client.session.findFirst({ orderBy: { createdAt: "desc" } });
}

/** Looks up a session by its unguessable setup path (setup page load). */
export function findSessionBySetupPath(
  client: DataClient,
  setupPath: string,
): Promise<Session | null> {
  return client.session.findUnique({ where: { setupPath } });
}

/**
 * Records one submission. The `(sessionId, deviceToken)` unique constraint
 * enforces one submission per device per session (§6); a duplicate device
 * rejects at the database rather than here.
 */
export function createSubmission(
  client: DataClient,
  input: CreateSubmissionInput,
): Promise<Submission> {
  return client.submission.create({
    data: {
      sessionId: input.sessionId,
      deviceToken: input.deviceToken,
      recoveryCode: input.recoveryCode,
      firstName: input.firstName,
      lastName: input.lastName,
      request: input.request,
    },
  });
}

/**
 * Updates a returning participant's editable fields before the reveal (§6:
 * "returning on the same phone before the reveal time → name/request
 * editable"). Located by submission id, which the caller resolves owner-scoped
 * from their own cookie first; the device token and recovery code are never
 * touched. The reveal cutoff is enforced by the caller, not here.
 */
export function updateSubmission(
  client: DataClient,
  input: UpdateSubmissionInput,
): Promise<Submission> {
  return client.submission.update({
    where: { id: input.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      request: input.request,
    },
  });
}

/**
 * Returns the caller's own submission for this device (return-on-same-phone,
 * §6). Owner-scoped retrieval: keyed by the caller's own cookie.
 */
export function findSubmissionByDeviceToken(
  client: DataClient,
  sessionId: string,
  deviceToken: string,
): Promise<Submission | null> {
  return client.submission.findUnique({
    where: { sessionId_deviceToken: { sessionId, deviceToken } },
  });
}

/**
 * Restores the caller's own submission from their recovery code on any device
 * (#8, §7.4). Owner-scoped retrieval: keyed by the bearer credential the owner
 * holds — same privacy risk profile as the return link, no new exposure model.
 */
export function findSubmissionByRecoveryCode(
  client: DataClient,
  sessionId: string,
  recoveryCode: string,
): Promise<Submission | null> {
  return client.submission.findUnique({
    where: { sessionId_recoveryCode: { sessionId, recoveryCode } },
  });
}

/**
 * The live submission count for the setup-page dashboard (§7.5, #8). Returns a
 * bare number only — never request content (Privacy #3). Also reads 0 after the
 * next-morning purge, doubling as the purge-verification view.
 */
export function countSubmissions(
  client: DataClient,
  sessionId: string,
): Promise<number> {
  return client.submission.count({ where: { sessionId } });
}

/**
 * The **only** path to prayer requests: a member fetching their own group
 * (Privacy #3, spec §3). Returns null when the caller is not yet in a frozen
 * group (before reveal, or the lone n=1 person). The group is located by
 * membership, so a caller can only ever read a group they belong to; only that
 * group's members' requests are returned.
 */
export async function getGroupAssignment(
  client: DataClient,
  params: { sessionId: string; submissionId: string },
): Promise<GroupAssignment | null> {
  const group: Pick<Group, "id" | "memberSubmissionIds"> | null =
    await client.group.findFirst({
      where: {
        sessionId: params.sessionId,
        memberSubmissionIds: { has: params.submissionId },
      },
      select: { id: true, memberSubmissionIds: true },
    });

  if (!group) {
    return null;
  }

  // Re-scope the member read to the same session as defence-in-depth: the ids
  // come from a session-scoped group row so they cannot cross sessions today,
  // but this keeps the request-read query itself session-bound rather than
  // trusting the pairing layer (#7) never to write a foreign submission id.
  const members = await client.submission.findMany({
    where: {
      sessionId: params.sessionId,
      id: { in: group.memberSubmissionIds },
    },
    select: { id: true, firstName: true, lastName: true, request: true },
  });

  // `findMany` does not guarantee it returns rows in `id: { in: [...] }`
  // order, so re-order by memberSubmissionIds to keep the return view's
  // numbered partner cards stable across reads (§7.3).
  const membersById = new Map(members.map((member) => [member.id, member]));

  return {
    groupId: group.id,
    members: group.memberSubmissionIds.flatMap((id) => {
      const member = membersById.get(id);
      return member
        ? [
            {
              submissionId: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              request: member.request,
              isSelf: member.id === params.submissionId,
            },
          ]
        : [];
    }),
  };
}

/**
 * A namespace seed for the session-scoped advisory lock, keeping this lock's
 * key space from colliding with any other advisory lock the app might take.
 * Combined with the session id via `hashtextextended` so each session locks
 * independently.
 */
const PAIRING_LOCK_SEED = 0x70726179; // "pray"

/**
 * Explicit interactive-transaction bounds for {@link freezePairing}, pinned
 * rather than left to Prisma's defaults (2s `maxWait` / 5s `timeout`), which
 * are silent and have shifted across Prisma versions.
 *
 * `timeout` bounds the whole callback — crucially, the time a losing trigger
 * spends **blocked on the advisory lock** counts against it. The winner's work
 * (read ids, shuffle, one `createMany`, one update) is milliseconds even for a
 * full event, so a generous ceiling gives a queued loser ample room to wait out
 * the winner and then read the frozen result, instead of aborting with a
 * timeout error at the very reveal instant this design exists to handle
 * gracefully. `maxWait` bounds the separate wait for a free pool connection —
 * relevant because reveal is a thundering herd against a small pool.
 */
const PAIRING_FREEZE_TIMEOUT_MS = 15_000;
const PAIRING_FREEZE_MAX_WAIT_MS = 10_000;

/**
 * The Prisma surface {@link freezePairing} needs: interactive transactions. The
 * freeze runs several reads and writes as one atomic unit, so — unlike the
 * single-delegate helpers above that take a {@link DataClient} — it takes the
 * transaction runner. The layer therefore has two client-subset types on
 * purpose: {@link DataClient} for the single-statement helpers, this one for
 * the one operation that spans a transaction. The real {@link PrismaClient}
 * satisfies both.
 */
export type PairingClient = Pick<PrismaClient, "$transaction">;

export interface FreezePairingParams {
  /** The session whose pairing is being frozen. */
  sessionId: string;
  /**
   * The app-clock instant the freeze is attempted at (§5 App-clock authority).
   * The pairing is refused before this reaches `revealAt`, and it is stamped
   * into `pairingFrozenAt` on success so the freeze moment is the app's, not a
   * scheduler's.
   */
  now: Date;
  /** Injectable randomness for the shuffle; defaults to {@link Math.random}. */
  random?: RandomSource;
}

export type FreezePairingResult =
  | {
      status: "frozen";
      /** The committed freeze instant (§4 write-once). */
      frozenAt: Date;
      /**
       * True when this call observed an already-frozen pairing and returned it
       * unchanged rather than computing — the losing side of a concurrent
       * trigger, or any later visitor. A frozen pairing never recomputes.
       */
      alreadyFrozen: boolean;
      /** Number of groups in the frozen pairing (0 for n < 2). */
      groupCount: number;
    }
  | {
      status: "not-open";
      /** The reveal instant the app clock has not yet reached. */
      revealAt: Date;
    };

/**
 * Computes and freezes the Pairing for a session, **once**, atomically (§4).
 *
 * The whole operation runs inside one interactive transaction that first takes
 * a **session-scoped advisory lock**: concurrent triggers at the reveal instant
 * serialize on it, so exactly one transaction computes the pairing while the
 * rest queue and then read the frozen result (`alreadyFrozen: true`). Because
 * the lock is transaction-scoped it releases automatically at commit or
 * rollback. A pairing that is already frozen is returned verbatim and never
 * recomputed (§4 write-once). App-clock authority is enforced here too (§5):
 * before `revealAt` the freeze is refused (`status: "not-open"`).
 *
 * The grouping itself is the pure {@link formGroups}; this function only owns
 * the atomic write. It reads submission **ids only** — never request text — so
 * the per-assignment privacy boundary of this module is preserved.
 */
export async function freezePairing(
  client: PairingClient,
  params: FreezePairingParams,
): Promise<FreezePairingResult> {
  const { sessionId, now } = params;

  return client.$transaction(
    async (tx: Prisma.TransactionClient): Promise<FreezePairingResult> => {
      // Single-winner session lock (§4/§5). `hashtextextended` derives a stable
      // 64-bit key from the session id under our namespace seed; the lock is
      // held for the rest of this transaction, so any concurrent freeze blocks
      // here until we commit and then falls into the already-frozen branch.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, ${PAIRING_LOCK_SEED}::bigint))`;

      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { id: true, revealAt: true, pairingFrozenAt: true },
      });
      if (!session) {
        throw new Error(
          `Cannot freeze pairing: session ${sessionId} not found.`,
        );
      }

      // Write-once (§4): a frozen pairing never changes and never recomputes.
      // The loser of a concurrent trigger — and every later visitor — lands
      // here and reads the frozen result.
      if (session.pairingFrozenAt) {
        const groupCount = await tx.group.count({ where: { sessionId } });
        return {
          status: "frozen",
          frozenAt: session.pairingFrozenAt,
          alreadyFrozen: true,
          groupCount,
        };
      }

      // App-clock authority (§5): the scheduler only nudges; the app's own
      // clock owns the reveal boundary. Refusing here guards the write-once
      // freeze itself — a mis-fired early trigger must not permanently lock a
      // partial pairing while submissions are still open. Same boundary helper
      // the submit cutoff uses, so `<` vs close=reveal lives in one place.
      if (isBeforeReveal(now, session.revealAt)) {
        return { status: "not-open", revealAt: session.revealAt };
      }

      // §4 steps 1–3: the submissions that beat the reveal cutoff, shuffled,
      // then paired (with one trio when odd). Ids only — no request content.
      const submissions = await tx.submission.findMany({
        where: { sessionId, createdAt: { lt: session.revealAt } },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      const groups = formGroups(
        shuffle(
          submissions.map((submission) => submission.id),
          params.random,
        ),
      );

      // One insert for the whole pairing rather than a create-per-group loop.
      // Skipped entirely for n < 2, where `groups` is empty (n=1 is the lone
      // person, who is never self-matched — no group row).
      if (groups.length > 0) {
        await tx.group.createMany({
          data: groups.map((memberSubmissionIds) => ({
            sessionId,
            memberSubmissionIds,
          })),
        });
      }

      // Stamp the freeze last, inside the same transaction, so the groups and
      // the frozen marker commit together — an observer never sees one without
      // the other.
      await tx.session.update({
        where: { id: sessionId },
        data: { pairingFrozenAt: now },
      });

      return {
        status: "frozen",
        frozenAt: now,
        alreadyFrozen: false,
        groupCount: groups.length,
      };
    },
    {
      // Read Committed (Postgres' default, pinned explicitly) is what makes the
      // advisory lock a correct single-winner: the loser blocks on the lock
      // until the winner commits, then its `findUnique` reads a fresh snapshot
      // and sees the committed `pairingFrozenAt`. Under Repeatable
      // Read/Serializable the loser's snapshot would predate the commit and it
      // would recompute, so the level is not left to the datasource default.
      isolationLevel: "ReadCommitted",
      // Bound the lock-wait + work budget explicitly (see the constants above)
      // so a queued trigger waits out the winner and reads the frozen result
      // rather than aborting on Prisma's silent default timeout.
      timeout: PAIRING_FREEZE_TIMEOUT_MS,
      maxWait: PAIRING_FREEZE_MAX_WAIT_MS,
    },
  );
}
