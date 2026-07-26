import { describe, expect, it } from "vitest";
import { GatheringError } from "@/lib/gathering/errors";
import { participantCookieName } from "@/lib/gathering/participant-session";

describe("participant cookie selection", () => {
  it("keeps the normal participant cookie when no tester slot is requested", () => {
    expect(
      participantCookieName(new Request("https://prayer.test/api/participant")),
    ).toBe("day-of-prayer-participant");
  });

  it("uses distinct cookie names for the first and last tester slots", () => {
    expect(
      participantCookieName(
        new Request("https://prayer.test/api/participant?testerSession=1"),
      ),
    ).toBe("day-of-prayer-participant-tester-1");
    expect(
      participantCookieName(
        new Request("https://prayer.test/api/participant?testerSession=6"),
      ),
    ).toBe("day-of-prayer-participant-tester-6");
  });

  it("rejects invalid tester slots instead of using the normal session", () => {
    expect(() =>
      participantCookieName(
        new Request("https://prayer.test/api/participant?testerSession=7"),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<GatheringError>>({
        code: "INVALID_TESTER_SESSION",
      }),
    );
  });
});
