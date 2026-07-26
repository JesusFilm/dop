import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reassignShortStudyReader: vi.fn(),
  getParticipantSnapshot: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/gathering/service", () => ({
  reassignShortStudyReader: mocks.reassignShortStudyReader,
  getParticipantSnapshot: mocks.getParticipantSnapshot,
}));

import { POST } from "@/app/api/participant/journey/reassign/route";

function request(body: unknown, origin = "https://prayer.test") {
  return new Request("https://prayer.test/api/participant/journey/reassign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "prayer.test",
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe("participant Short Study reassign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: "participant-token" }),
    });
    mocks.reassignShortStudyReader.mockResolvedValue("changed");
    mocks.getParticipantSnapshot.mockResolvedValue({
      state: "ROOM",
      revision: 3,
    });
  });

  it("passes the expected contribution and revision to the lifecycle", async () => {
    const response = await POST(
      request({ expectedState: "module-1:0", expectedRevision: 2 }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reassignShortStudyReader).toHaveBeenCalledWith({
      sessionTokenHash:
        "434e05169b4e0bd6d360ab48a271760ac415bb9cdbfbef5bc82ded1cecd428c5",
      expectedState: "module-1:0",
      expectedRevision: 2,
    });
    expect(await response.json()).toMatchObject({ reassigned: true });
  });

  it("returns a fresh snapshot with a stale result after a revision mismatch", async () => {
    mocks.reassignShortStudyReader.mockResolvedValue("stale");
    mocks.getParticipantSnapshot.mockResolvedValue({
      state: "ROOM",
      revision: 4,
    });

    const response = await POST(
      request({ expectedState: "module-1:0", expectedRevision: 2 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      snapshot: { state: "ROOM", revision: 4 },
      reassigned: false,
      result: "stale",
    });
  });

  it("rejects stale-shaped and cross-origin requests before mutation", async () => {
    expect((await POST(request({ expectedState: "module-1:0" }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          request(
            { expectedState: "module-1:0", expectedRevision: 2 },
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.reassignShortStudyReader).not.toHaveBeenCalled();
  });
});
