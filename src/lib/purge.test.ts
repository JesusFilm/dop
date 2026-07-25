import { describe, expect, it, vi } from "vitest";

import { purgeDueSessions } from "@/lib/purge";
import type { DataClient } from "@/lib/repository";

/**
 * Builds a fake {@link DataClient} whose delete/read delegates record calls.
 * Rows are held in memory so a second purge run can be asserted as a no-op.
 */
function fakeClient(
  sessions: Array<{ id: string; name: string; purgeAfter: Date }>,
  rows: { submissions: Record<string, number>; groups: Record<string, number> },
) {
  const findMany = vi.fn(
    async ({ where }: { where: { purgeAfter: { lte: Date } } }) =>
      sessions.filter(
        (session) =>
          session.purgeAfter.getTime() <= where.purgeAfter.lte.getTime(),
      ),
  );

  const deleteMany = (bucket: Record<string, number>) =>
    vi.fn(async ({ where }: { where: { sessionId: string } }) => {
      const count = bucket[where.sessionId] ?? 0;
      bucket[where.sessionId] = 0;
      return { count };
    });

  const submissionDeleteMany = deleteMany(rows.submissions);
  const groupDeleteMany = deleteMany(rows.groups);

  const client = {
    session: { findMany },
    submission: { deleteMany: submissionDeleteMany },
    group: { deleteMany: groupDeleteMany },
  } as unknown as DataClient;

  return { client, findMany, submissionDeleteMany, groupDeleteMany };
}

const PURGE_AFTER = new Date("2026-07-27T18:00:00.000Z"); // 06:00 Tue NZST

describe("purgeDueSessions", () => {
  it("deletes the session's submissions once the purge instant has passed", async () => {
    const { client, submissionDeleteMany, groupDeleteMany } = fakeClient(
      [{ id: "sess_1", name: "Day of Prayer", purgeAfter: PURGE_AFTER }],
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

  it("leaves a session alone before its purge instant", async () => {
    const { client, findMany, submissionDeleteMany } = fakeClient(
      [{ id: "sess_1", name: "Day of Prayer", purgeAfter: PURGE_AFTER }],
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
  });

  it("deletes the derived groups before the submissions they reference", async () => {
    const order: string[] = [];
    const client = {
      session: {
        findMany: vi.fn(async () => [
          { id: "sess_1", name: "Day of Prayer", purgeAfter: PURGE_AFTER },
        ]),
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
    } as unknown as DataClient;

    await purgeDueSessions(client, new Date("2026-07-28T00:00:00.000Z"));

    expect(order).toEqual(["groups", "submissions"]);
  });

  it("is idempotent — a second run reports zero deletions", async () => {
    const { client } = fakeClient(
      [{ id: "sess_1", name: "Day of Prayer", purgeAfter: PURGE_AFTER }],
      { submissions: { sess_1: 97 }, groups: { sess_1: 48 } },
    );

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
        { id: "sess_1", name: "Day of Prayer", purgeAfter: PURGE_AFTER },
        {
          id: "sess_2",
          name: "Day of Prayer (reuse)",
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
