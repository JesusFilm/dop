import { describe, expect, it, vi } from "vitest";

import { purgeDueSessions } from "@/lib/purge";
import { countSubmissions, type DataClient } from "@/lib/repository";

interface FakeSession {
  id: string;
  name: string;
  purgeAfter: Date;
}

/**
 * Builds a fake {@link DataClient} over an in-memory row store, so a purge can
 * be asserted through the same reads the app uses — including the setup page's
 * submission count (the purge-verification view, §8.4) — and so a second run can
 * be asserted as a no-op.
 */
function fakeClient(
  sessions: FakeSession[],
  rows: { submissions: Record<string, number>; groups: Record<string, number> },
) {
  const findMany = vi.fn(
    async ({ where }: { where: { purgeAfter: { lte: Date } } }) =>
      sessions
        .filter(
          (session) =>
            session.purgeAfter.getTime() <= where.purgeAfter.lte.getTime(),
        )
        .map((session) => ({ id: session.id, name: session.name })),
  );

  const deleteMany = (bucket: Record<string, number>) =>
    vi.fn(async ({ where }: { where: { sessionId: string } }) => {
      const count = bucket[where.sessionId] ?? 0;
      bucket[where.sessionId] = 0;
      return { count };
    });

  const submissionDeleteMany = deleteMany(rows.submissions);
  const groupDeleteMany = deleteMany(rows.groups);
  const count = vi.fn(
    async ({ where }: { where: { sessionId: string } }) =>
      rows.submissions[where.sessionId] ?? 0,
  );
  // Prisma's array form of $transaction takes already-built delegate promises
  // and runs them as one unit; awaiting them together models that closely
  // enough for these tests while preserving construction order.
  const transaction = vi.fn(
    async (operations: Promise<unknown>[]) => await Promise.all(operations),
  );

  const client = {
    session: { findMany },
    submission: { deleteMany: submissionDeleteMany, count },
    group: { deleteMany: groupDeleteMany },
    $transaction: transaction,
  } as unknown as DataClient;

  return {
    client,
    findMany,
    submissionDeleteMany,
    groupDeleteMany,
    transaction,
  };
}

const PURGE_AFTER = new Date("2026-07-27T18:00:00.000Z"); // 06:00 Tue NZST
const DAY_OF_PRAYER: FakeSession = {
  id: "sess_1",
  name: "Day of Prayer",
  purgeAfter: PURGE_AFTER,
};

describe("purgeDueSessions", () => {
  it("deletes the session's submissions once the purge instant has passed", async () => {
    const { client, submissionDeleteMany, groupDeleteMany } = fakeClient(
      [DAY_OF_PRAYER],
      { submissions: { sess_1: 97 }, groups: { sess_1: 48 } },
    );

    const report = await purgeDueSessions(
      client,
      new Date("2026-07-27T18:00:30.000Z"),
    );

    expect(submissionDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1" },
    });
    expect(groupDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_1" },
    });
    expect(report).toEqual({
      ranAt: new Date("2026-07-27T18:00:30.000Z"),
      submissionsDeleted: 97,
      sessions: [
        {
          sessionId: "sess_1",
          name: "Day of Prayer",
          submissionsDeleted: 97,
          groupsDeleted: 48,
        },
      ],
    });
  });

  it("leaves the setup-page count reading 0 — the purge-verification view", async () => {
    const { client } = fakeClient([DAY_OF_PRAYER], {
      submissions: { sess_1: 97 },
      groups: { sess_1: 48 },
    });

    expect(await countSubmissions(client, "sess_1")).toBe(97);

    await purgeDueSessions(client, new Date("2026-07-27T18:00:30.000Z"));

    expect(await countSubmissions(client, "sess_1")).toBe(0);
  });

  it("leaves a session alone before its purge instant", async () => {
    const { client, findMany, submissionDeleteMany } = fakeClient(
      [DAY_OF_PRAYER],
      { submissions: { sess_1: 97 }, groups: { sess_1: 48 } },
    );

    const report = await purgeDueSessions(
      client,
      new Date("2026-07-27T17:59:59.000Z"),
    );

    expect(findMany).toHaveBeenCalled();
    expect(submissionDeleteMany).not.toHaveBeenCalled();
    expect(report.sessions).toEqual([]);
    expect(report.submissionsDeleted).toBe(0);
    // Nothing due, nothing deleted — and the count is untouched.
    expect(await countSubmissions(client, "sess_1")).toBe(97);
  });

  it("deletes the groups and submissions as one transaction, groups first", async () => {
    const order: string[] = [];
    const transaction = vi.fn(
      async (operations: Promise<unknown>[]) => await Promise.all(operations),
    );
    const client = {
      session: {
        findMany: vi.fn(async () => [{ id: "sess_1", name: "Day of Prayer" }]),
      },
      submission: {
        deleteMany: vi.fn(async () => {
          order.push("submissions");
          return { count: 2 };
        }),
      },
      group: {
        deleteMany: vi.fn(async () => {
          order.push("groups");
          return { count: 1 };
        }),
      },
      $transaction: transaction,
    } as unknown as DataClient;

    await purgeDueSessions(client, new Date("2026-07-28T00:00:00.000Z"));

    // A half-done purge that left the requests behind would be a Privacy #3
    // failure, so both deletes go through one transaction.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["groups", "submissions"]);
  });

  it("is idempotent — a second run reports zero deletions", async () => {
    const { client } = fakeClient([DAY_OF_PRAYER], {
      submissions: { sess_1: 97 },
      groups: { sess_1: 48 },
    });

    await purgeDueSessions(client, new Date("2026-07-28T00:00:00.000Z"));
    const second = await purgeDueSessions(
      client,
      new Date("2026-07-28T01:00:00.000Z"),
    );

    expect(second.submissionsDeleted).toBe(0);
    expect(second.sessions).toEqual([
      {
        sessionId: "sess_1",
        name: "Day of Prayer",
        submissionsDeleted: 0,
        groupsDeleted: 0,
      },
    ]);
  });

  it("purges every due session and totals the submissions removed", async () => {
    const { client } = fakeClient(
      [
        DAY_OF_PRAYER,
        {
          id: "sess_2",
          name: "Day of Prayer (earlier event)",
          purgeAfter: new Date("2026-07-26T18:00:00.000Z"),
        },
      ],
      {
        submissions: { sess_1: 97, sess_2: 3 },
        groups: { sess_1: 48, sess_2: 1 },
      },
    );

    const report = await purgeDueSessions(
      client,
      new Date("2026-07-28T00:00:00.000Z"),
    );

    expect(report.sessions.map((entry) => entry.sessionId)).toEqual([
      "sess_1",
      "sess_2",
    ]);
    expect(report.submissionsDeleted).toBe(100);
  });

  it("defaults to the app's own clock when no instant is supplied", async () => {
    const { client, findMany } = fakeClient([], {
      submissions: {},
      groups: {},
    });

    const before = Date.now();
    const report = await purgeDueSessions(client);

    expect(findMany).toHaveBeenCalled();
    expect(report.ranAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
