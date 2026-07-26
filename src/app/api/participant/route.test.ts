import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getParticipantSnapshot: vi.fn(),
  joinParticipant: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/gathering/service", () => ({
  getParticipantSnapshot: mocks.getParticipantSnapshot,
  joinParticipant: mocks.joinParticipant,
}));

import { GET, POST } from "@/app/api/participant/route";

function request(method = "GET", testerSession?: string) {
  const query = testerSession ? `?testerSession=${testerSession}` : "";
  return new Request(`https://prayer.test/api/participant${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      host: "prayer.test",
      origin: "https://prayer.test",
    },
    body:
      method === "POST"
        ? JSON.stringify({ displayName: "Participant 2", prayerRequest: "" })
        : undefined,
  });
}

describe("participant route session selection", () => {
  const getCookie = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getCookie.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: getCookie });
    mocks.getParticipantSnapshot.mockResolvedValue({
      state: "JOIN",
      revision: 0,
    });
  });

  it("reads the normal participant cookie by default", async () => {
    await GET(request());

    expect(getCookie).toHaveBeenCalledWith("day-of-prayer-participant");
  });

  it("sets and reads a tester-slot cookie without changing the normal cookie", async () => {
    const response = await POST(request("POST", "2"));

    expect(getCookie).toHaveBeenCalledWith(
      "day-of-prayer-participant-tester-2",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "day-of-prayer-participant-tester-2=",
    );
    expect(mocks.joinParticipant).toHaveBeenCalledOnce();
  });

  it("rejects an invalid tester slot before joining", async () => {
    const response = await POST(request("POST", "7"));

    expect(response.status).toBe(400);
    expect(mocks.joinParticipant).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
