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
      { id: "participant-1", name: "Ana", isLeader: true },
      { id: "participant-2", name: "Ben", isLeader: false },
    ],
  },
  journey: activeJourney,
};

const ministryPrayerJourney: ActiveJourney = {
  ...activeJourney,
  expectedState: "ministry-module:0",
  module: {
    id: "ministry-module",
    title: "Pray for our ministries",
    behaviorKey: "ministry-prayer",
    configuration: { bundlesPerRoom: 5 },
    recommendedSeconds: 2_400,
    startedAt: "2026-07-26T00:00:00.000Z",
    serverTime: "2026-07-26T00:01:00.000Z",
    ministryPrayer: {
      bundle: {
        id: "finance-one",
        ministry: "FINANCE",
        sections: [
          {
            heading: "Please Pray",
            points: [
              "The FY 26 audit is underway. Pray it goes smoothly and well (it usually does).",
            ],
          },
        ],
      },
      bundleNumber: 1,
      bundleCount: 5,
      assignees: [
        { id: "participant-1", name: "Ana" },
        { id: "participant-2", name: "Ben" },
      ],
      viewerRole: "leader",
      canReassign: true,
      bundleStartedAt: "2026-07-26T00:00:30.000Z",
      bundleRecommendedSeconds: 480,
    },
  },
};

const ministryPrayerSnapshot: RoomSnapshot = {
  ...activeSnapshot,
  journey: ministryPrayerJourney,
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
  it("shows the active activity timer in the participant header", () => {
    render(<ParticipantExperience initialSnapshot={activeSnapshot} />);

    const header = screen
      .getByLabelText("Day of Prayer home")
      .closest("header");
    expect(header).not.toBeNull();
    if (!header) throw new Error("Expected the participant header");
    expect(header.className).toContain("sticky");
    expect(within(header).getByRole("timer")).toBeTruthy();
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.queryByText("Shared gathering")).toBeNull();
    expect(screen.queryByText("Boardroom · July prayer journey")).toBeNull();
  });

  it("leaves the participant header unbadged outside an active module", () => {
    render(<ParticipantExperience initialSnapshot={completedSnapshot} />);

    const header = screen
      .getByLabelText("Day of Prayer home")
      .closest("header");
    expect(header).not.toBeNull();
    if (!header) throw new Error("Expected the participant header");
    expect(within(header).queryByText("Shared gathering")).toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("shows synchronized overall and bundle timers for ministry prayer", () => {
    render(<ParticipantExperience initialSnapshot={ministryPrayerSnapshot} />);

    expect(screen.getAllByRole("timer")).toHaveLength(2);
    expect(screen.getByText("Overall:")).toBeTruthy();
    expect(screen.getByText("This bundle:")).toBeTruthy();
  });

  it("replaces the live snapshot after a successful advance", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      response({ ok: true, body: completedSnapshot }),
    );
    const { container } = render(
      <ParticipantExperience
        initialSnapshot={activeSnapshot}
        homeHref="/admin/tester/participant/1"
        endpoints={{
          snapshot: "/api/participant?testerSession=1",
          leader: "/api/participant/leader?testerSession=1",
          journeyAdvance: "/api/participant/journey/advance?testerSession=1",
          journeyReassign: "/api/participant/journey/reassign?testerSession=1",
        }}
      />,
    );

    expect(
      screen.getByLabelText("Day of Prayer home").getAttribute("href"),
    ).toBe("/admin/tester/participant/1");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "/api/participant/journey/advance?testerSession=1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Thanks for praying, Ana.",
      }),
    ).toBeTruthy();
    const subheading = screen.getByText("We hope you enjoyed this experience.");
    const encouragement = screen.getByText(
      "Go in peace. May the God of hope fill you with all joy and peace as you trust in Him. — Romans 15:13",
    );
    expect(subheading.className).toContain("font-semibold");
    expect(encouragement).toBeTruthy();
    expect(screen.queryByText("Boardroom")).toBeNull();
    expect(container.querySelector(".lucide-party-popper")).not.toBeNull();
    expect(container.querySelector(".lucide-circle-check")).toBeNull();
    expect(screen.queryByText(/completed state is saved/i)).toBeNull();
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

describe("ModuleShell leader controls", () => {
  it("shows Continue only to the leader", () => {
    render(
      <ModuleShell
        snapshot={activeSnapshot}
        journey={activeJourney}
        onAdvance={vi.fn()}
        onReassign={vi.fn()}
        onTakeover={vi.fn()}
        isPending={false}
        error=""
      />,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Leader unavailable? Take over",
      }),
    ).toBeNull();
  });

  it("shows shared Short Study content with leader and reader-specific cues", () => {
    const shortStudyJourney: ActiveJourney = {
      ...activeJourney,
      expectedState: "module-1:0",
      module: {
        id: "module-1",
        title: "Why we pray",
        behaviorKey: "short-study",
        configuration: {
          translation: "Berean Standard Bible (BSB)",
        },
        recommendedSeconds: 3_600,
        startedAt: "2026-07-26T00:00:00.000Z",
        serverTime: "2026-07-26T00:01:00.000Z",
        shortStudy: {
          contribution: {
            id: "passage",
            kind: "passage",
            label: "Hebrews 4:14–16",
            text: "Let us then approach the throne of grace.",
          },
          contributionNumber: 1,
          contributionCount: 3,
          reader: { id: "participant-2", name: "Ben" },
          viewerRole: "leader",
          canReassign: true,
        },
      },
    };
    const { rerender } = render(
      <ModuleShell
        snapshot={activeSnapshot}
        journey={shortStudyJourney}
        onAdvance={vi.fn()}
        onReassign={vi.fn().mockResolvedValue("changed")}
        onTakeover={vi.fn()}
        isPending={false}
        error=""
      />,
    );

    const instruction = screen.getByRole("heading", {
      level: 2,
      name: "Ask Ben to read this aloud.",
    });
    const contributionLabel = screen.getByText("Hebrews 4:14–16");
    expect(
      instruction.compareDocumentPosition(contributionLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue" }).closest(".fixed"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reassign current reader" }),
    ).toBeTruthy();
    if (shortStudyJourney.module.behaviorKey !== "short-study") {
      throw new Error("Expected Short Study fixture");
    }

    rerender(
      <ModuleShell
        snapshot={{
          ...activeSnapshot,
          participant: { id: "participant-2", name: "Ben" },
        }}
        journey={{
          ...shortStudyJourney,
          module: {
            ...shortStudyJourney.module,
            shortStudy: {
              ...shortStudyJourney.module.shortStudy,
              viewerRole: "reader",
              canReassign: false,
            },
          },
        }}
        onAdvance={vi.fn()}
        onReassign={vi.fn()}
        onTakeover={vi.fn()}
        isPending={false}
        error=""
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "You’re reading this aloud",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Let us then approach the throne of grace."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Reassign current reader" }),
    ).toBeNull();
  });

  it("shows one ministry bundle and targets either assigned person for replacement", () => {
    const onReassign = vi.fn().mockResolvedValue("changed");
    render(
      <ModuleShell
        snapshot={ministryPrayerSnapshot}
        journey={ministryPrayerJourney}
        onAdvance={vi.fn()}
        onReassign={onReassign}
        onTakeover={vi.fn()}
        isPending={false}
        error=""
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Invite Ana and Ben to pray for this bundle.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "FINANCE" })).toBeTruthy();
    expect(screen.getByText("Bundle 1 of 5")).toBeTruthy();
    expect(
      screen.getByText(
        "The FY 26 audit is underway. Pray it goes smoothly and well (it usually does).",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("bundle-2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Replace Ben" }));
    expect(onReassign).toHaveBeenCalledWith("participant-2");
  });

  it("asks the leader to retry when reader reassignment is stale", async () => {
    const shortStudyJourney: ActiveJourney = {
      ...activeJourney,
      expectedState: "module-1:0",
      module: {
        id: "module-1",
        title: "Why we pray",
        behaviorKey: "short-study",
        configuration: {
          translation: "Berean Standard Bible (BSB)",
        },
        recommendedSeconds: 3_600,
        startedAt: "2026-07-26T00:00:00.000Z",
        serverTime: "2026-07-26T00:01:00.000Z",
        shortStudy: {
          contribution: {
            id: "passage",
            kind: "passage",
            label: "Hebrews 4:14–16",
            text: "Let us approach the throne of grace.",
          },
          contributionNumber: 1,
          contributionCount: 3,
          reader: { id: "participant-2", name: "Ben" },
          viewerRole: "leader",
          canReassign: true,
        },
      },
    };
    render(
      <ModuleShell
        snapshot={activeSnapshot}
        journey={shortStudyJourney}
        onAdvance={vi.fn()}
        onReassign={vi.fn().mockResolvedValue("stale")}
        onTakeover={vi.fn()}
        isPending={false}
        error=""
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reassign current reader" }),
    );

    expect(
      await screen.findByText("The room moved on. Try reassigning again."),
    ).toBeTruthy();
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
        onReassign={vi.fn()}
        onTakeover={vi.fn().mockRejectedValue(new Error("Rejected"))}
        isPending={false}
        error=""
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Leader unavailable? Take over",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Lead this group?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm takeover" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "We couldn’t update the leader. Please try again.",
    );
  });
});

describe("RoomAssignment journey start", () => {
  it("uses a celebratory heading with the room and directions beneath it", () => {
    render(<RoomAssignment snapshot={activeSnapshot} onTakeover={vi.fn()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your group is ready." }),
    ).toBeTruthy();
    expect(screen.getByText("Boardroom, upstairs")).toBeTruthy();
    expect(
      screen.getByText(
        "Please make your way to Boardroom and wait for the group to gather.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Room name")).toBeNull();
    expect(screen.queryByText("Gathering")).toBeNull();
    expect(screen.queryByText("2 members")).toBeNull();
  });

  it("anchors the start action below the leader label and clears a long member list", () => {
    const onStartJourney = vi.fn();
    const gatheringSnapshot = {
      ...activeSnapshot,
      room: {
        ...activeSnapshot.room,
        members: Array.from({ length: 20 }, (_, index) => ({
          id: `participant-${index + 1}`,
          name: `Participant ${index + 1}`,
          isLeader: index === 0,
        })),
      },
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
      />,
    );

    const startButton = screen.getByRole("button", {
      name: "Start first activity",
    });
    const fixedTray = startButton.closest(".fixed");
    const leaderLabel = screen.getByText("You’re the room leader");

    expect(fixedTray).not.toBeNull();
    expect(fixedTray?.contains(leaderLabel)).toBe(true);
    expect(
      leaderLabel.compareDocumentPosition(startButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("main").className.split(" ")).toContain("pb-48");
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(
      screen.queryByText("Start July prayer journey when everyone is ready."),
    ).toBeNull();

    rerender(
      <RoomAssignment
        snapshot={gatheringSnapshot}
        onTakeover={vi.fn()}
        onStartJourney={onStartJourney}
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
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Start first activity" }),
    ).toBeNull();
  });
});
