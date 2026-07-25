import type {
  Group,
  PrismaClient,
  Session,
  Submission,
} from "@/generated/prisma/client";

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
export type DataClient = Pick<
  PrismaClient,
  "session" | "submission" | "group" | "$transaction"
>;

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

/** A session the auto-purge job has found to be due (§8, §10). */
export interface SessionDueForPurge {
  id: string;
  name: string;
}

/** Row counts a purge removed, for the job's log. */
export interface PurgeCounts {
  submissionsDeleted: number;
  groupsDeleted: number;
}

/**
 * The sessions whose next-morning purge instant has passed (§8, #8). Selects
 * the id and name only — never submission content (Privacy #3). Ordered by
 * purge instant, oldest first, so the job's log reads chronologically.
 */
export function findSessionsDueForPurge(
  client: DataClient,
  now: Date,
): Promise<SessionDueForPurge[]> {
  return client.session.findMany({
    where: { purgeAfter: { lte: now } },
    select: { id: true, name: true },
    orderBy: { purgeAfter: "asc" },
  });
}

/**
 * Deletes a session's submissions, plus the groups derived from them (§8, §10 —
 * "all data is auto-deleted the next morning"). Both deletes run in **one
 * transaction**: a half-done purge that left the requests behind would be a
 * Privacy #3 failure, so either both row sets go or neither does. Groups are
 * deleted first so no intermediate state inside the transaction has a group
 * referencing submission ids that are already gone — `memberSubmissionIds` is a
 * plain id array with no foreign key to enforce that ordering for us.
 *
 * Two rows are deliberately left alone. The `Session` itself stays because the
 * organizer's setup page needs it to render, and its submission count reading
 * **0** is the purge-verification view (#8). `pairingFrozenAt` stays set because
 * the freeze is write-once (§4): clearing it would re-open a settled session to
 * a recompute rather than leaving it closed and empty.
 *
 * Returns the row counts removed so the job can log what it did without ever
 * touching request content.
 */
export async function purgeSessionSubmissions(
  client: DataClient,
  sessionId: string,
): Promise<PurgeCounts> {
  const [groups, submissions] = await client.$transaction([
    client.group.deleteMany({ where: { sessionId } }),
    client.submission.deleteMany({ where: { sessionId } }),
  ]);

  return {
    submissionsDeleted: submissions.count,
    groupsDeleted: groups.count,
  };
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
