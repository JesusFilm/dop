// @vitest-environment jsdom

import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSettings } from "@/components/organizer/admin-settings";
import { OrganizerDashboard } from "@/components/organizer/organizer-dashboard";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { OrganizerSnapshot } from "@/lib/gathering/types";

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/use-live-snapshot", () => ({
  useLiveSnapshot(initialSnapshot: OrganizerSnapshot) {
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    return { snapshot, setSnapshot, isDisconnected: false };
  },
}));

const snapshot: OrganizerSnapshot = {
  phase: "FORMING",
  revision: 1,
  participantCount: 2,
  prayerRequestCount: 1,
  capacitySufficient: true,
  journey: { available: true, name: "July prayer journey" },
  rooms: [
    {
      id: "room-1",
      name: "Boardroom",
      directions: "Upstairs",
      maxCapacity: 8,
      memberCount: 2,
      coordinatorName: null,
      journeyState: "unavailable",
      members: [
        { id: "participant-1", name: "Ana", isCoordinator: false },
        { id: "participant-2", name: "Ben", isCoordinator: false },
      ],
    },
  ],
};

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function errorResponse(message: string) {
  return {
    ok: false,
    json: vi.fn().mockResolvedValue({ error: message }),
  } as unknown as Response;
}

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(fetchWithTimeout).mockReset();
});

describe("organizer mutations", () => {
  it("disables the reveal confirmation while pending and keeps errors in the modal", async () => {
    const request = deferredResponse();
    vi.mocked(fetchWithTimeout).mockReturnValue(request.promise);
    render(<OrganizerDashboard initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Reveal assignments" }));
    const dialog = screen.getByRole("dialog", {
      name: "Reveal room assignments?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reveal assignments" }),
    );

    expect(
      within(dialog).getByRole("button", { name: "Updating…" }),
    ).toHaveProperty("disabled", true);

    request.resolve(errorResponse("Launch failed."));
    expect(await within(dialog).findByRole("alert")).toHaveProperty(
      "textContent",
      "Launch failed.",
    );
    expect(screen.queryAllByRole("alert")).toHaveLength(1);
  });

  it("disables the reset confirmation while pending and reports failures", async () => {
    const request = deferredResponse();
    vi.mocked(fetchWithTimeout).mockReturnValue(request.promise);
    render(<AdminSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Reset gathering" }));
    const dialog = screen.getByRole("dialog", {
      name: "Reset this gathering?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset gathering" }),
    );

    expect(
      within(dialog).getByRole("button", { name: "Resetting…" }),
    ).toHaveProperty("disabled", true);

    request.resolve(errorResponse("Reset failed."));
    expect(await within(dialog).findByRole("alert")).toHaveProperty(
      "textContent",
      "Reset failed.",
    );
  });
});
