// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModuleShell } from "@/components/journey/module-shell";
import { ParticipantExperience } from "@/components/participant/participant-experience";
import { RoomAssignment } from "@/components/participant/room-assignment";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { ParticipantSnapshot } from "@/lib/gathering/types";

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/use-live-snapshot", () => ({
  useLiveSnapshot(initialSnapshot: ParticipantSnapshot) {
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    return { snapshot, setSnapshot, isDisconnected: false };
  },
}));

type RoomSnapshot = Extract<ParticipantSnapshot, { state: "ROOM" }>;
type ActiveJourney = Extract<
  NonNullable<RoomSnapshot["journey"]>,
  { state: "ACTIVE" }
>;

const activeJourney: ActiveJourney = {
  state: "ACTIVE",
  journeyName: "July prayer journey",
  expectedState: "module-1",
  joinedInProgress: false,
  module: {
    id: "module-1",
    title: "Prayer and praise",
    behaviorKey: "test-guided-prayer",
    configuration: { prompt: "Pray together." },
    recommendedSeconds: 600,
    startedAt: "2026-07-26T00:00:00.000Z",
    serverTime: "2026-07-26T00:01:00.000Z",
  },
};

const activeSnapshot: RoomSnapshot = {
  state: "ROOM",
  revision: 2,
  participant: { id: "participant-1", name: "Ana" },
  room: {
    id: "room-1",
    name: "Boardroom",
    directions: "Upstairs",
    members: [
      { id: "participant-1", name: "Ana", isCoordinator: true },
      { id: "participant-2", name: "Ben", isCoordinator: false },
    ],
  },
  journey: activeJourney,
};

const completedSnapshot: Extract<ParticipantSnapshot, { state: "ROOM" }> = {
  ...activeSnapshot,
  revision: 3,
  journey: {
    state: "COMPLETED",
    journeyName: "July prayer journey",
    expectedState: "completed",
    joinedInProgress: false,
  },
};

function response({
  ok,
  body,
}: {
  ok: boolean;
  body: ParticipantSnapshot | { error: string };
}) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(fetchWithTimeout).mockReset();
});

describe("ParticipantExperience journey progression", () => {
  it("replaces the live snapshot after a successful advance", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      response({ ok: true, body: completedSnapshot }),
    );
    render(<ParticipantExperience initialSnapshot={activeSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", {
        name: "Your room has completed the journey.",
      }),
    ).toBeTruthy();
  });

  it("shows a non-OK response and restores the Continue action", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      response({ ok: false, body: { error: "The room already moved." } }),
    );
    render(<ParticipantExperience initialSnapshot={activeSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "The room already moved.",
    );
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("shows a network failure and restores the Continue action", async () => {
    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error("Network offline"));
    render(<ParticipantExperience initialSnapshot={activeSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Network offline",
    );
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

describe("ModuleShell coordinator controls", () => {
  it("shows Continue only to the coordinator", () => {
    render(
      <ModuleShell
        snapshot={activeSnapshot}
        journey={activeJourney}
        onAdvance={vi.fn()}
        onTakeover={vi.fn()}
        isPending={false}
        error=""
      />,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Coordinator unavailable? Take over",
      }),
    ).toBeNull();
  });

  it("confirms takeover and displays rejection feedback", async () => {
    const memberSnapshot = {
      ...activeSnapshot,
      participant: { id: "participant-2", name: "Ben" },
    };
    render(
      <ModuleShell
        snapshot={memberSnapshot}
        journey={activeJourney}
        onAdvance={vi.fn()}
        onTakeover={vi.fn().mockRejectedValue(new Error("Rejected"))}
        isPending={false}
        error=""
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Coordinator unavailable? Take over",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Lead this group?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm takeover" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "We couldn’t update the coordinator. Please try again.",
    );
  });
});

describe("RoomAssignment journey start", () => {
  it("shows and disables the start action only for the coordinator", () => {
    const onStartJourney = vi.fn();
    const gatheringSnapshot = {
      ...activeSnapshot,
      journey: {
        state: "GATHERING" as const,
        journeyName: "July prayer journey",
        expectedState: "gathering" as const,
        joinedInProgress: false,
      },
    };
    const { rerender } = render(
      <RoomAssignment
        snapshot={gatheringSnapshot}
        onTakeover={vi.fn()}
        onStartJourney={onStartJourney}
        journeyName="July prayer journey"
        isJourneyPending
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Starting…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    rerender(
      <RoomAssignment
        snapshot={{
          ...gatheringSnapshot,
          participant: { id: "participant-2", name: "Ben" },
        }}
        onTakeover={vi.fn()}
        onStartJourney={onStartJourney}
        journeyName="July prayer journey"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Start first activity" }),
    ).toBeNull();
  });
});
