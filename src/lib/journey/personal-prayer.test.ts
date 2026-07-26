import { describe, expect, it } from "vitest";
import {
  addParticipantToPersonalPrayerState,
  createPersonalPrayerState,
  parsePersonalPrayerState,
  revealPersonalPrayerState,
  validatePersonalPrayerConfiguration,
} from "@/lib/journey/personal-prayer";

const participants = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `participant-${index + 1}`,
  }));

describe("personal prayer groups", () => {
  it.each([
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [4]],
    [5, [3, 2]],
    [6, [3, 3]],
    [7, [3, 2, 2]],
    [8, [3, 3, 2]],
    [10, [3, 3, 2, 2]],
  ])("groups %i people without leaving a singleton", (count, expectedSizes) => {
    const state = createPersonalPrayerState(participants(count), () => 0.5);

    expect(state.phase).toBe("grouping");
    expect(state.groups.map((group) => group.length)).toEqual(expectedSizes);
    expect(state.groups.flat().sort()).toEqual(
      participants(count)
        .map(({ id }) => id)
        .sort(),
    );
  });

  it("randomizes once through an injected source", () => {
    const state = createPersonalPrayerState(participants(5), () => 0);

    expect(state.groups.flat()).toEqual([
      "participant-2",
      "participant-3",
      "participant-4",
      "participant-5",
      "participant-1",
    ]);
  });

  it("adds a late participant to the first smallest group without reshuffling", () => {
    const state = createPersonalPrayerState(participants(5), () => 0.5);
    const next = addParticipantToPersonalPrayerState(state, "participant-6");

    expect(next.groups[0]).toEqual(state.groups[0]);
    expect(next.groups[1]).toEqual([...state.groups[1], "participant-6"]);
  });

  it("preserves the phase when a participant joins after reveal", () => {
    const revealed = revealPersonalPrayerState(
      createPersonalPrayerState(participants(5), () => 0.5),
    );

    expect(
      addParticipantToPersonalPrayerState(revealed, "participant-6").phase,
    ).toBe("revealed");
  });

  it("rejects duplicate assignments and malformed state", () => {
    expect(
      parsePersonalPrayerState({
        phase: "grouping",
        groups: [["participant-1"], ["participant-1"]],
      }),
    ).toBeUndefined();
    expect(
      parsePersonalPrayerState({ phase: "waiting", groups: [] }),
    ).toBeUndefined();
  });

  it("accepts only an empty configuration", () => {
    expect(validatePersonalPrayerConfiguration({})).toEqual({});
    expect(
      validatePersonalPrayerConfiguration({ request: "server-only" }),
    ).toBeUndefined();
  });
});
