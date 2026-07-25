import { describe, expect, it, vi } from "vitest";

import * as repository from "@/lib/repository";
import {
  countSubmissions,
  createSession,
  createSubmission,
  findCurrentSession,
  findSessionBySetupPath,
  findSessionsDueForPurge,
  findSubmissionByDeviceToken,
  findSubmissionByRecoveryCode,
  getGroupAssignment,
  purgeSessionSubmissions,
  updateSubmission,
  type DataClient,
} from "@/lib/repository";

/**
 * Builds a fake {@link DataClient}. Only the delegate methods a given test
 * exercises need to be supplied; the rest throw if unexpectedly called.
 */
function fakeClient(overrides: {
  session?: Partial<DataClient["session"]>;
  submission?: Partial<DataClient["submission"]>;
  group?: Partial<DataClient["group"]>;
  transaction?: (operations: Promise<unknown>[]) => Promise<unknown[]>;
}): DataClient {
  return {
    session: overrides.session,
    submission: overrides.submission,
    group: overrides.group,
    $transaction: overrides.transaction,
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

describe("findSessionsDueForPurge", () => {
  it("selects only sessions whose purge instant has passed, oldest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = fakeClient({ session: { findMany } });
    const now = new Date("2026-07-27T18:00:30.000Z");

    await findSessionsDueForPurge(client, now);

    expect(findMany).toHaveBeenCalledWith({
      where: { purgeAfter: { lte: now } },
      select: { id: true, name: true },
      orderBy: { purgeAfter: "asc" },
    });
  });
});

describe("purgeSessionSubmissions", () => {
  it("deletes the session's groups and submissions in one transaction and reports the counts", async () => {
    const submissionDeleteMany = vi.fn().mockResolvedValue({ count: 97 });
    const groupDeleteMany = vi.fn().mockResolvedValue({ count: 48 });
    const transaction = vi.fn(
      async (operations: Promise<unknown>[]) => await Promise.all(operations),
    );
    const client = fakeClient({
      submission: { deleteMany: submissionDeleteMany },
      group: { deleteMany: groupDeleteMany },
      transaction,
    });

    const result = await purgeSessionSubmissions(client, "sess_1");

    expect(groupDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1" },
    });
    expect(submissionDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1" },
    });
    // Either both row sets go or neither does (Privacy #3).
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ submissionsDeleted: 97, groupsDeleted: 48 });
  });

  it("keeps the Session row itself so the setup page can verify the purge", async () => {
    const sessionDelete = vi.fn();
    const client = fakeClient({
      session: { delete: sessionDelete, deleteMany: sessionDelete },
      submission: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      group: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      transaction: vi.fn(
        async (operations: Promise<unknown>[]) => await Promise.all(operations),
      ),
    });

    await purgeSessionSubmissions(client, "sess_1");

    expect(sessionDelete).not.toHaveBeenCalled();
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
        "findSessionsDueForPurge",
        "findSubmissionByDeviceToken",
        "findSubmissionByRecoveryCode",
        "getGroupAssignment",
        "purgeSessionSubmissions",
        "updateSubmission",
      ].sort(),
    );
    expect(
      exported.some((name) => /all|list|every|dump|export/i.test(name)),
    ).toBe(false);
  });
});
