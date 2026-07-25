import { describe, expect, it } from "vitest";

import { formatCountdown, isRevealOpen, msUntilReveal } from "@/lib/reveal";

describe("isRevealOpen", () => {
  const revealAt = new Date("2026-07-26T23:00:00.000Z");

  it("is false strictly before the reveal instant (partner content withheld)", () => {
    expect(isRevealOpen(new Date("2026-07-26T22:59:59.999Z"), revealAt)).toBe(
      false,
    );
  });

  it("is true at the reveal instant (close = reveal, one instant)", () => {
    expect(isRevealOpen(revealAt, revealAt)).toBe(true);
  });

  it("is true after the reveal instant", () => {
    expect(isRevealOpen(new Date("2026-07-26T23:00:00.001Z"), revealAt)).toBe(
      true,
    );
  });
});

describe("msUntilReveal", () => {
  const revealAt = new Date("2026-07-26T23:00:00.000Z");

  it("returns the remaining milliseconds before the reveal", () => {
    expect(msUntilReveal(new Date("2026-07-26T22:00:00.000Z"), revealAt)).toBe(
      60 * 60 * 1000,
    );
  });

  it("clamps to zero at the reveal instant", () => {
    expect(msUntilReveal(revealAt, revealAt)).toBe(0);
  });

  it("clamps to zero (never negative) after the reveal instant", () => {
    expect(msUntilReveal(new Date("2026-07-26T23:05:00.000Z"), revealAt)).toBe(
      0,
    );
  });
});

describe("formatCountdown", () => {
  it("formats hours, minutes, and seconds when at least an hour remains", () => {
    expect(formatCountdown((1 * 3600 + 59 * 60 + 45) * 1000)).toBe("1:59:45");
  });

  it("omits the hours segment under an hour, zero-padding minutes and seconds", () => {
    expect(formatCountdown((5 * 60 + 3) * 1000)).toBe("5:03");
  });

  it("rounds partial seconds up so the label never shows 0:00 while time remains", () => {
    expect(formatCountdown(500)).toBe("0:01");
  });

  it("renders 0:00 at (and past) the reveal instant", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5000)).toBe("0:00");
  });

  it("zero-pads minutes when hours are present", () => {
    expect(formatCountdown((2 * 3600 + 4 * 60 + 9) * 1000)).toBe("2:04:09");
  });
});
