// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParticipantTester } from "@/components/organizer/participant-tester";

afterEach(cleanup);

describe("ParticipantTester", () => {
  it("renders six independently addressed participant frames", () => {
    render(<ParticipantTester />);

    const frames = screen.getAllByTitle(/^Participant \d$/);
    expect(frames).toHaveLength(6);
    expect(frames.map((frame) => frame.getAttribute("src"))).toEqual([
      "/admin/tester/participant/1",
      "/admin/tester/participant/2",
      "/admin/tester/participant/3",
      "/admin/tester/participant/4",
      "/admin/tester/participant/5",
      "/admin/tester/participant/6",
    ]);
  });
});
