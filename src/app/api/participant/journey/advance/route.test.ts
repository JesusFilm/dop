import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  advanceRoomJourney: vi.fn(),
  getParticipantSnapshot: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/gathering/service", () => ({
  advanceRoomJourney: mocks.advanceRoomJourney,
  getParticipantSnapshot: mocks.getParticipantSnapshot,
}));

import { POST } from "@/app/api/participant/journey/advance/route";

function request(body: unknown, origin = "https://prayer.test") {
  return new Request("https://prayer.test/api/participant/journey/advance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "prayer.test",
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe("participant journey advance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: "participant-token" }),
    });
    mocks.getParticipantSnapshot.mockResolvedValue({
      state: "ROOM",
      revision: 2,
    });
  });

  it("passes the participant session and expected state to the lifecycle", async () => {
    const response = await POST(request({ expectedState: "gathering" }));

    expect(response.status).toBe(200);
    expect(mocks.advanceRoomJourney).toHaveBeenCalledWith({
      sessionTokenHash:
        "434e05169b4e0bd6d360ab48a271760ac415bb9cdbfbef5bc82ded1cecd428c5",
      expectedState: "gathering",
    });
  });

  it("rejects cross-origin requests before changing state", async () => {
    const response = await POST(
      request({ expectedState: "gathering" }, "https://attacker.test"),
    );

    expect(response.status).toBe(403);
    expect(mocks.advanceRoomJourney).not.toHaveBeenCalled();
  });

  it("rejects a missing expected state", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(mocks.advanceRoomJourney).not.toHaveBeenCalled();
  });

  it("rejects an expired participant session", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });

    const response = await POST(request({ expectedState: "gathering" }));

    expect(response.status).toBe(401);
    expect(mocks.advanceRoomJourney).not.toHaveBeenCalled();
    expect(mocks.getParticipantSnapshot).not.toHaveBeenCalled();
  });
});
