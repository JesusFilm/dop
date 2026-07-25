import { describe, expect, it } from "vitest";
import { getLiveSnapshotPollDelay } from "@/lib/use-live-snapshot";

describe("getLiveSnapshotPollDelay", () => {
  it("returns to one-second polling after recovery clears failures", () => {
    expect(getLiveSnapshotPollDelay(0)).toBe(1_000);
  });

  it("backs off repeated failures without exceeding ten seconds", () => {
    expect(getLiveSnapshotPollDelay(1)).toBe(2_000);
    expect(getLiveSnapshotPollDelay(3)).toBe(6_000);
    expect(getLiveSnapshotPollDelay(6)).toBe(10_000);
  });
});
