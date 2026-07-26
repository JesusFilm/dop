import { describe, expect, it } from "vitest";
import {
  buildShortStudyContributions,
  createShortStudyState,
  parseShortStudyState,
  reassignCurrentReader,
  reconcileShortStudyLeader,
  validateShortStudyConfiguration,
} from "@/lib/journey/short-study";

const configuration = {
  passageReference: "Hebrews 4:14–16",
  scriptureText: "Therefore, since we have a great high priest…",
  translation: "Berean Standard Bible (BSB)",
  reflections: ["Jesus understands.", "We can approach confidently."],
  discussionQuestion: "How should this shape the way we pray?",
};

const participants = [
  { id: "leader", name: "Ana" },
  { id: "ben", name: "Ben" },
  { id: "chi", name: "Chi" },
];

describe("Short Study configuration", () => {
  it("validates configured content and derives its ordered contributions", () => {
    expect(validateShortStudyConfiguration(configuration)).toEqual(
      configuration,
    );
    expect(buildShortStudyContributions(configuration)).toEqual([
      expect.objectContaining({ id: "passage", kind: "passage" }),
      expect.objectContaining({ id: "reflection-0", kind: "reflection" }),
      expect.objectContaining({ id: "reflection-1", kind: "reflection" }),
      expect.objectContaining({ id: "discussion", kind: "discussion" }),
      {
        id: "prayer",
        kind: "prayer",
        label: "Pray together",
        text: "Take time now to pray together as a group.",
      },
    ]);
  });

  it.each([
    {},
    { ...configuration, scriptureText: "" },
    { ...configuration, reflections: [] },
    { ...configuration, reflections: [""] },
    { ...configuration, discussionQuestion: "" },
  ])("rejects malformed configuration", (value) => {
    expect(validateShortStudyConfiguration(value)).toBeUndefined();
  });
});

describe("Short Study assignment state", () => {
  it("excludes the leader and exhausts a shuffled round before repeating", () => {
    const state = createShortStudyState(
      configuration,
      participants,
      "leader",
      () => 0,
    );

    expect(state.contributionIndex).toBe(0);
    expect(state.assignments).toHaveLength(3);
    expect(state.assignments).not.toContain("leader");
    expect(new Set(state.assignments.slice(0, 2))).toEqual(
      new Set(["ben", "chi"]),
    );
  });

  it("uses null assignments when only the leader is present", () => {
    expect(
      createShortStudyState(configuration, participants.slice(0, 1), "leader")
        .assignments,
    ).toEqual([null, null, null]);
  });

  it("parses only complete state matching the configured reading count", () => {
    const state = { contributionIndex: 1, assignments: ["ben", "chi", "ben"] };
    expect(parseShortStudyState(state, configuration)).toEqual(state);
    expect(
      parseShortStudyState(
        { contributionIndex: 5, assignments: state.assignments },
        configuration,
      ),
    ).toBeUndefined();
    expect(
      parseShortStudyState(
        { contributionIndex: 1, assignments: ["ben"] },
        configuration,
      ),
    ).toBeUndefined();
  });

  it("reassigns only the current reader and preserves future assignments", () => {
    const state = {
      contributionIndex: 0,
      assignments: ["ben", "chi", "ben"],
    };
    expect(
      reassignCurrentReader(state, participants, "leader", () => 0),
    ).toEqual({
      changed: true,
      state: {
        contributionIndex: 0,
        assignments: ["chi", "chi", "ben"],
      },
    });
  });

  it("leaves state unchanged when no other reader is available", () => {
    const state = { contributionIndex: 0, assignments: ["ben", "ben", "ben"] };
    expect(
      reassignCurrentReader(state, participants.slice(0, 2), "leader"),
    ).toEqual({ changed: false, state });
  });

  it("removes a new leader from unfinished assignments", () => {
    const state = {
      contributionIndex: 1,
      assignments: ["ben", "chi", "ben"],
    };
    const reconciled = reconcileShortStudyLeader(
      state,
      participants,
      "chi",
      () => 0,
    );

    expect(reconciled.assignments[0]).toBe("ben");
    expect(reconciled.assignments[1]).not.toBe("chi");
    expect(reconciled.assignments[2]).toBe("ben");
    expect(reconciled.contributionIndex).toBe(1);
  });
});
