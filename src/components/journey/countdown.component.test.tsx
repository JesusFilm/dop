// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "./countdown";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Countdown", () => {
  it("stops its interval after the recommended time elapses", () => {
    vi.useFakeTimers();
    const clearInterval = vi.spyOn(window, "clearInterval");
    let monotonicNow = 0;
    vi.spyOn(performance, "now").mockImplementation(() => monotonicNow);

    render(
      <Countdown
        startedAt="2026-07-26T00:00:00.000Z"
        recommendedSeconds={2}
        serverTime="2026-07-26T00:00:01.000Z"
      />,
    );

    expect(screen.getByRole("timer").textContent).toContain("0:01");
    monotonicNow = 1_000;
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer").textContent).toContain(
      "Recommended time reached",
    );
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
