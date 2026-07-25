import { describe, expect, it, vi } from "vitest";

import * as repository from "@/lib/repository";
import {
  countSubmissions,
  createSession,
  createSubmission,
  findCurrentSession,
  findSessionBySetupPath,
  findSubmissionByDeviceToken,
  findSubmissionByRecoveryCode,
  freezePairing,
  getGroupAssignment,
  updateSubmission,
  type DataClient,
  type FreezePairingResult,
  type PairingClient,
} from "@/lib/repository";

/**
 * Builds a fake {@link DataClient}. Only the delegate methods a given test
 * exercises need to be supplied; the rest throw if unexpectedly called.
 */
function fakeClient(overrides: {
  session?: Partial<DataClient["session"]>;
  submission?: Partial<DataClient["submission"]>;
  group?: Partial<DataClient["group"]>;
}): DataClient {
  return {
    session: overrides.session,
    submission: overrides.submission,
    group: overrides.group,
  } as unknown as DataClient;
}

describe("createSession", () => {
  it("persists organizer-set instants and omits timeZone so the default applies", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sess_1" });
    const client = fakeClient({ session: { create } });

    await createSession(client, {
      name: "Day of Prayer",
      setupPath: "unguessable-slug",
      opensAt: new Date("2026-07-26T21:00:00.000Z"),
      revealAt: new Date("2026-07-26T23:00:00.000Z"),
      purgeAfter: new Date("2026-07-27T18:00:00.000Z"),
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        name: "Day of Prayer",
        setupPath: "unguessable-slug",
        opensAt: new Date("2026-07-26T21:00:00.000Z"),
        revealAt: new Date("2026-07-26T23:00:00.000Z"),
        purgeAfter: new Date("2026-07-27T18:00:00.000Z"),
      },
    });
    // No timeZone key → the schema default "Pacific/Auckland" is used (#14).
    expect(create.mock.calls[0][0].data).not.toHaveProperty("timeZone");
  });

  it("passes an explicit timeZone through when supplied", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sess_1" });
    const client = fakeClient({ session: { create } });

    await createSession(client, {
      name: "Reuse event",
      setupPath: "another-slug",
      opensAt: new Date("2027-01-01T00:00:00.000Z"),
      revealAt: new Date("2027-01-01T02:00:00.000Z"),
      purgeAfter: new Date("2027-01-01T18:00:00.000Z"),
      timeZone: "Pacific/Auckland",
    });

    expect(create.mock.calls[0][0].data.timeZone).toBe("Pacific/Auckland");
  });
});

describe("findSessionBySetupPath", () => {
  it("looks the session up by its unguessable slug", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const client = fakeClient({ session: { findUnique } });

    await findSessionBySetupPath(client, "unguessable-slug");

    expect(findUnique).toHaveBeenCalledWith({
      where: { setupPath: "unguessable-slug" },
    });
  });
});

describe("findCurrentSession", () => {
  it("returns the single session, most recent first for the reuse seam", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "sess_1" });
    const client = fakeClient({ session: { findFirst } });

    const result = await findCurrentSession(client);

    expect(findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual({ id: "sess_1" });
  });
});

describe("createSubmission", () => {
  it("writes both required name fields and the request", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub_1" });
    const client = fakeClient({ submission: { create } });

    await createSubmission(client, {
      sessionId: "sess_1",
      deviceToken: "device-abc",
      recoveryCode: "R3C0V3R",
      firstName: "Ada",
      lastName: "Lovelace",
      request: "wisdom for a decision",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        sessionId: "sess_1",
        deviceToken: "device-abc",
        recoveryCode: "R3C0V3R",
        firstName: "Ada",
        lastName: "Lovelace",
        request: "wisdom for a decision",
      },
    });
  });
});

describe("updateSubmission", () => {
  it("updates only the editable fields, never the token or recovery code", async () => {
    const update = vi.fn().mockResolvedValue({ id: "sub_1" });
    const client = fakeClient({ submission: { update } });

    await updateSubmission(client, {
      id: "sub_1",
      firstName: "Grace",
      lastName: "Hopper",
      request: "an updated request",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: {
        firstName: "Grace",
        lastName: "Hopper",
        request: "an updated request",
      },
    });
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("deviceToken");
    expect(data).not.toHaveProperty("recoveryCode");
  });
});

describe("owner-scoped submission lookups", () => {
  it("finds a submission by this device's cookie", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const client = fakeClient({ submission: { findUnique } });

    await findSubmissionByDeviceToken(client, "sess_1", "device-abc");

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        sessionId_deviceToken: {
          sessionId: "sess_1",
          deviceToken: "device-abc",
        },
      },
    });
  });

  it("finds a submission by its recovery code", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const client = fakeClient({ submission: { findUnique } });

    await findSubmissionByRecoveryCode(client, "sess_1", "R3C0V3R");

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        sessionId_recoveryCode: {
          sessionId: "sess_1",
          recoveryCode: "R3C0V3R",
        },
      },
    });
  });
});

describe("countSubmissions", () => {
  it("returns a bare count and never request content", async () => {
    const count = vi.fn().mockResolvedValue(42);
    const client = fakeClient({ submission: { count } });

    const total = await countSubmissions(client, "sess_1");

    expect(total).toBe(42);
    expect(count).toHaveBeenCalledWith({ where: { sessionId: "sess_1" } });
  });
});

describe("getGroupAssignment", () => {
  it("returns null when the caller is not in a frozen group yet", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn();
    const client = fakeClient({
      group: { findFirst },
      submission: { findMany },
    });

    const assignment = await getGroupAssignment(client, {
      sessionId: "sess_1",
      submissionId: "sub_self",
    });

    expect(assignment).toBeNull();
    // No request read happens when there is no group.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("locates the group by membership, so a caller only reads a group they belong to", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "grp_1",
      memberSubmissionIds: ["sub_self", "sub_partner"],
    });
    const findMany = vi.fn().mockResolvedValue([]);
    const client = fakeClient({
      group: { findFirst },
      submission: { findMany },
    });

    await getGroupAssignment(client, {
      sessionId: "sess_1",
      submissionId: "sub_self",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        sessionId: "sess_1",
        memberSubmissionIds: { has: "sub_self" },
      },
      select: { id: true, memberSubmissionIds: true },
    });
  });

  it("returns only this group's members with the self flag set", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "grp_1",
      memberSubmissionIds: ["sub_self", "sub_partner"],
    });
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "sub_self",
        firstName: "Ada",
        lastName: "Lovelace",
        request: "wisdom",
      },
      {
        id: "sub_partner",
        firstName: "Grace",
        lastName: "Hopper",
        request: "rest",
      },
    ]);
    const client = fakeClient({
      group: { findFirst },
      submission: { findMany },
    });

    const assignment = await getGroupAssignment(client, {
      sessionId: "sess_1",
      submissionId: "sub_self",
    });

    // Only the members of the caller's own group are queried, and the read is
    // re-scoped to the session as defence-in-depth (Privacy #3).
    expect(findMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1", id: { in: ["sub_self", "sub_partner"] } },
      select: { id: true, firstName: true, lastName: true, request: true },
    });
    expect(assignment).toEqual({
      groupId: "grp_1",
      members: [
        {
          submissionId: "sub_self",
          firstName: "Ada",
          lastName: "Lovelace",
          request: "wisdom",
          isSelf: true,
        },
        {
          submissionId: "sub_partner",
          firstName: "Grace",
          lastName: "Hopper",
          request: "rest",
          isSelf: false,
        },
      ],
    });
  });

  it("orders members by memberSubmissionIds even when the query returns them out of order", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "grp_1",
      memberSubmissionIds: ["sub_self", "sub_partner"],
    });
    // findMany returns partner-first; the result must still be self-first.
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "sub_partner",
        firstName: "Grace",
        lastName: "Hopper",
        request: "rest",
      },
      {
        id: "sub_self",
        firstName: "Ada",
        lastName: "Lovelace",
        request: "wisdom",
      },
    ]);
    const client = fakeClient({
      group: { findFirst },
      submission: { findMany },
    });

    const assignment = await getGroupAssignment(client, {
      sessionId: "sess_1",
      submissionId: "sub_self",
    });

    expect(assignment?.members.map((m) => m.submissionId)).toEqual([
      "sub_self",
      "sub_partner",
    ]);
  });

  it("supports a trio (odd count) — three members, one request card each", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "grp_trio",
      memberSubmissionIds: ["a", "b", "c"],
    });
    const findMany = vi.fn().mockResolvedValue([
      { id: "a", firstName: "A", lastName: "One", request: "r1" },
      { id: "b", firstName: "B", lastName: "Two", request: "r2" },
      { id: "c", firstName: "C", lastName: "Three", request: "r3" },
    ]);
    const client = fakeClient({
      group: { findFirst },
      submission: { findMany },
    });

    const assignment = await getGroupAssignment(client, {
      sessionId: "sess_1",
      submissionId: "b",
    });

    expect(assignment?.members).toHaveLength(3);
    expect(assignment?.members.filter((m) => m.isSelf)).toHaveLength(1);
    expect(assignment?.members.find((m) => m.isSelf)?.submissionId).toBe("b");
  });
});

/**
 * A fake {@link PairingClient} whose `$transaction` runs the callback with the
 * supplied transaction delegates immediately (no real database). Only the
 * delegate methods a given test exercises need to be provided; `$queryRaw`
 * (the advisory lock) defaults to a no-op.
 */
function fakePairingClient(tx: {
  $queryRaw?: unknown;
  session?: Record<string, unknown>;
  submission?: Record<string, unknown>;
  group?: Record<string, unknown>;
}): PairingClient {
  const transactionClient = {
    $queryRaw: tx.$queryRaw ?? vi.fn().mockResolvedValue([]),
    session: tx.session,
    submission: tx.submission,
    group: tx.group,
  };
  return {
    $transaction: (fn: (client: unknown) => unknown) => fn(transactionClient),
  } as unknown as PairingClient;
}

const REVEAL_AT = new Date("2026-07-27T23:00:00.000Z");
const AFTER_REVEAL = new Date("2026-07-27T23:00:01.000Z");

/**
 * These tests drive `freezePairing` through a fake `$transaction` that runs the
 * callback inline. That verifies the freeze's *logic* — compute-once, the
 * write-once short-circuit, the app-clock guard, and the SQL it issues — but by
 * construction it cannot exercise real multi-connection contention on the
 * Postgres advisory lock, nor the `ReadCommitted` isolation the single-winner
 * guarantee leans on. Those hold only against a live database and are out of
 * scope for this unit suite (they belong to an integration test).
 */
describe("freezePairing", () => {
  it("computes, writes groups, and stamps pairingFrozenAt when unfrozen", async () => {
    const advisoryLock = vi.fn().mockResolvedValue([]);
    const findUnique = vi.fn().mockResolvedValue({
      id: "sess_1",
      revealAt: REVEAL_AT,
      pairingFrozenAt: null,
    });
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const groupCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const sessionUpdate = vi.fn().mockResolvedValue({});

    const client = fakePairingClient({
      $queryRaw: advisoryLock,
      session: { findUnique, update: sessionUpdate },
      submission: { findMany },
      group: { createMany: groupCreateMany },
    });

    const result = await freezePairing(client, {
      sessionId: "sess_1",
      now: AFTER_REVEAL,
      // A near-1 random keeps Fisher–Yates from moving anything, so the
      // asserted grouping is deterministic.
      random: () => 0.999999,
    });

    // The session lock is the actual advisory-lock SQL (concurrent triggers
    // serialize on it), keyed by this session id — asserted on content so a
    // regression to a non-xact variant or a different key is caught.
    expect(advisoryLock).toHaveBeenCalledTimes(1);
    const [lockSql, ...lockValues] = advisoryLock.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(lockSql.join("?")).toContain("pg_advisory_xact_lock");
    expect(lockSql.join("?")).toContain("hashtextextended");
    expect(lockValues).toContain("sess_1");
    // n=3 → exactly one trio, written in a single createMany.
    expect(groupCreateMany).toHaveBeenCalledTimes(1);
    expect(groupCreateMany.mock.calls[0][0]).toEqual({
      data: [{ sessionId: "sess_1", memberSubmissionIds: ["a", "b", "c"] }],
    });
    // Only the reveal-cutoff submissions are read, ids only (Privacy #3).
    expect(findMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1", createdAt: { lt: REVEAL_AT } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    // The freeze instant is the app clock's, stamped last.
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { pairingFrozenAt: AFTER_REVEAL },
    });

    expect(result).toEqual<FreezePairingResult>({
      status: "frozen",
      frozenAt: AFTER_REVEAL,
      alreadyFrozen: false,
      groupCount: 1,
    });
  });

  it("splits an even count into pairs and never writes a trio", async () => {
    const groupCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const client = fakePairingClient({
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sess_1",
          revealAt: REVEAL_AT,
          pairingFrozenAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      submission: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "a" },
            { id: "b" },
            { id: "c" },
            { id: "d" },
          ]),
      },
      group: { createMany: groupCreateMany },
    });

    const result = await freezePairing(client, {
      sessionId: "sess_1",
      now: AFTER_REVEAL,
      random: () => 0.999999,
    });

    expect(groupCreateMany).toHaveBeenCalledTimes(1);
    expect(groupCreateMany.mock.calls[0][0].data).toEqual([
      { sessionId: "sess_1", memberSubmissionIds: ["a", "b"] },
      { sessionId: "sess_1", memberSubmissionIds: ["c", "d"] },
    ]);
    expect(result).toMatchObject({ status: "frozen", groupCount: 2 });
  });

  it("freezes at exactly the reveal instant (close = reveal is inclusive)", async () => {
    // `now === revealAt` is the sharp boundary `isBeforeReveal` hinges on: not
    // before the reveal, so the freeze proceeds rather than refusing.
    const groupCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = fakePairingClient({
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sess_1",
          revealAt: REVEAL_AT,
          pairingFrozenAt: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      submission: {
        findMany: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
      },
      group: { createMany: groupCreateMany },
    });

    const result = await freezePairing(client, {
      sessionId: "sess_1",
      now: new Date(REVEAL_AT),
    });

    expect(groupCreateMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "frozen", groupCount: 1 });
  });

  it("writes no group for the lone n=1 person but still freezes", async () => {
    const groupCreateMany = vi.fn().mockResolvedValue({ count: 0 });
    const sessionUpdate = vi.fn().mockResolvedValue({});
    const client = fakePairingClient({
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sess_1",
          revealAt: REVEAL_AT,
          pairingFrozenAt: null,
        }),
        update: sessionUpdate,
      },
      submission: { findMany: vi.fn().mockResolvedValue([{ id: "a" }]) },
      group: { createMany: groupCreateMany },
    });

    const result = await freezePairing(client, {
      sessionId: "sess_1",
      now: AFTER_REVEAL,
    });

    // Never self-matched: no group is written (the empty set is not inserted).
    expect(groupCreateMany).not.toHaveBeenCalled();
    // The freeze still happened so it is not retried forever.
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    expect(result).toEqual<FreezePairingResult>({
      status: "frozen",
      frozenAt: AFTER_REVEAL,
      alreadyFrozen: false,
      groupCount: 0,
    });
  });

  it("returns the existing frozen result without recomputing (write-once)", async () => {
    const frozenAt = new Date("2026-07-27T23:00:05.000Z");
    const findMany = vi.fn();
    const groupCreateMany = vi.fn();
    const sessionUpdate = vi.fn();

    const client = fakePairingClient({
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sess_1",
          revealAt: REVEAL_AT,
          pairingFrozenAt: frozenAt,
        }),
        update: sessionUpdate,
      },
      submission: { findMany },
      group: {
        createMany: groupCreateMany,
        count: vi.fn().mockResolvedValue(4),
      },
    });

    const result = await freezePairing(client, {
      sessionId: "sess_1",
      now: AFTER_REVEAL,
    });

    // A frozen pairing never recomputes: no submissions read, no writes.
    expect(findMany).not.toHaveBeenCalled();
    expect(groupCreateMany).not.toHaveBeenCalled();
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(result).toEqual<FreezePairingResult>({
      status: "frozen",
      frozenAt,
      alreadyFrozen: true,
      groupCount: 4,
    });
  });

  it("computes once across repeated triggers on the same session (single-winner)", async () => {
    // Model the single-winner sequence a real advisory lock produces: the
    // winner freezes; a later trigger sees the committed `pairingFrozenAt` and
    // reads it back rather than recomputing. A stateful fake session row stands
    // in for the row the lock serializes access to. (Real contention on the
    // lock itself needs a live database — see this describe block's note.)
    const sessionRow = {
      id: "sess_1",
      revealAt: REVEAL_AT,
      pairingFrozenAt: null as Date | null,
    };
    let groupRows = 0;
    const groupCreateMany = vi.fn().mockImplementation(async ({ data }) => {
      groupRows += data.length;
      return { count: data.length };
    });

    const client = fakePairingClient({
      session: {
        findUnique: vi.fn().mockImplementation(async () => ({ ...sessionRow })),
        update: vi.fn().mockImplementation(async ({ data }) => {
          sessionRow.pairingFrozenAt = data.pairingFrozenAt;
          return {};
        }),
      },
      submission: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]),
      },
      group: {
        createMany: groupCreateMany,
        count: vi.fn().mockImplementation(async () => groupRows),
      },
    });

    const first = await freezePairing(client, {
      sessionId: "sess_1",
      now: AFTER_REVEAL,
      random: () => 0.999999,
    });
    const second = await freezePairing(client, {
      sessionId: "sess_1",
      now: new Date("2026-07-27T23:05:00.000Z"),
      random: () => 0.999999,
    });

    // Exactly one compute: the trio is written once, never a second time.
    expect(groupCreateMany).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ alreadyFrozen: false, groupCount: 1 });
    // The loser reads the frozen result — same freeze instant, never recomputed.
    expect(second).toEqual<FreezePairingResult>({
      status: "frozen",
      frozenAt: AFTER_REVEAL,
      alreadyFrozen: true,
      groupCount: 1,
    });
  });

  it("refuses to freeze before the reveal instant (app-clock authority)", async () => {
    const findMany = vi.fn();
    const groupCreateMany = vi.fn();
    const sessionUpdate = vi.fn();

    const client = fakePairingClient({
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sess_1",
          revealAt: REVEAL_AT,
          pairingFrozenAt: null,
        }),
        update: sessionUpdate,
      },
      submission: { findMany },
      group: { createMany: groupCreateMany },
    });

    const result = await freezePairing(client, {
      sessionId: "sess_1",
      now: new Date("2026-07-27T22:59:59.000Z"),
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(groupCreateMany).not.toHaveBeenCalled();
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(result).toEqual<FreezePairingResult>({
      status: "not-open",
      revealAt: REVEAL_AT,
    });
  });

  it("throws when the session does not exist", async () => {
    const client = fakePairingClient({
      session: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      freezePairing(client, { sessionId: "missing", now: AFTER_REVEAL }),
    ).rejects.toThrow(/session missing not found/);
  });
});

describe("data-access surface (Privacy #3)", () => {
  it("exposes no function that lists or returns all requests for a session", () => {
    const exported = Object.keys(repository).filter(
      (key) =>
        typeof (repository as Record<string, unknown>)[key] === "function",
    );

    // Per-assignment retrieval is the only request path. Guard against a
    // future "list all requests" accessor sneaking into the boundary.
    expect(exported.sort()).toEqual(
      [
        "countSubmissions",
        "createSession",
        "createSubmission",
        "findCurrentSession",
        "findSessionBySetupPath",
        "findSubmissionByDeviceToken",
        "findSubmissionByRecoveryCode",
        "freezePairing",
        "getGroupAssignment",
        "updateSubmission",
      ].sort(),
    );
    expect(
      exported.some((name) => /all|list|every|dump|export/i.test(name)),
    ).toBe(false);
  });
});
