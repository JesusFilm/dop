import { describe, expect, it } from "vitest";
import { getLiveSnapshotPollDelay } from "@/lib/use-live-snapshot";

describe("getLiveSnapshotPollDelay", () => {
  it("polls healthy snapshots every second", () => {
    expect(getLiveSnapshotPollDelay(false, 0)).toBe(1_000);
  });

  it("backs off repeated failures without exceeding ten seconds", () => {
    expect(getLiveSnapshotPollDelay(true, 1)).toBe(2_000);
    expect(getLiveSnapshotPollDelay(true, 3)).toBe(6_000);
    expect(getLiveSnapshotPollDelay(true, 6)).toBe(10_000);
  });
});
