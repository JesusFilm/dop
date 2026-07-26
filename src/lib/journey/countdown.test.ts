import { describe, expect, it } from "vitest";
import { getJourneyCountdown } from "@/lib/journey/countdown";

describe("journey countdown", () => {
  const startedAt = "2026-07-26T00:00:00.000Z";

  it("counts down from the recommended duration", () => {
    expect(
      getJourneyCountdown(startedAt, 300, Date.parse(startedAt) + 61_000),
    ).toEqual({ remainingSeconds: 239, elapsed: false, label: "3:59" });
  });

  it("stays elapsed after zero without advancing", () => {
    expect(
      getJourneyCountdown(startedAt, 300, Date.parse(startedAt) + 301_000),
    ).toEqual({
      remainingSeconds: 0,
      elapsed: true,
      label: "Recommended time reached",
    });
  });
});
