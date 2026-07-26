import { shuffled, type Random } from "@/lib/journey/random";

export type PersonalPrayerConfiguration = Record<string, never>;

export type PersonalPrayerState = {
  phase: "grouping" | "revealed";
  groups: string[][];
};

type Participant = { id: string };

export function validatePersonalPrayerConfiguration(
  value: unknown,
): PersonalPrayerConfiguration | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 0
  ) {
    return undefined;
  }
  return {};
}

function groupSizes(participantCount: number): number[] {
  if (participantCount <= 4)
    return participantCount === 0 ? [] : [participantCount];

  const remainder = participantCount % 3;
  if (remainder === 0) return Array(participantCount / 3).fill(3);
  if (remainder === 2) {
    return [...Array(Math.floor(participantCount / 3)).fill(3), 2];
  }
  return [...Array(Math.floor(participantCount / 3) - 1).fill(3), 2, 2];
}

export function createPersonalPrayerState(
  participants: Participant[],
  random: Random = Math.random,
): PersonalPrayerState {
  const participantIds = shuffled(
    participants.map(({ id }) => id),
    random,
  );
  let offset = 0;
  const groups = groupSizes(participantIds.length).map((size) => {
    const group = participantIds.slice(offset, offset + size);
    offset += size;
    return group;
  });
  return { phase: "grouping", groups };
}

export function parsePersonalPrayerState(
  value: unknown,
): PersonalPrayerState | undefined {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (
    !candidate ||
    (candidate.phase !== "grouping" && candidate.phase !== "revealed") ||
    !Array.isArray(candidate.groups) ||
    !candidate.groups.every(
      (group) =>
        Array.isArray(group) &&
        group.length > 0 &&
        group.every((participantId) => typeof participantId === "string"),
    )
  ) {
    return undefined;
  }

  const groups = candidate.groups as string[][];
  const participantIds = groups.flat();
  if (new Set(participantIds).size !== participantIds.length) return undefined;

  return { phase: candidate.phase, groups };
}

export function addParticipantToPersonalPrayerState(
  state: PersonalPrayerState,
  participantId: string,
): PersonalPrayerState {
  if (state.groups.some((group) => group.includes(participantId))) return state;
  if (state.groups.length === 0) {
    return { ...state, groups: [[participantId]] };
  }

  const targetIndex = state.groups.reduce(
    (smallestIndex, group, index, groups) =>
      group.length < (groups[smallestIndex]?.length ?? Number.POSITIVE_INFINITY)
        ? index
        : smallestIndex,
    0,
  );
  return {
    ...state,
    groups: state.groups.map((group, index) =>
      index === targetIndex ? [...group, participantId] : group,
    ),
  };
}

export function revealPersonalPrayerState(
  state: PersonalPrayerState,
): PersonalPrayerState {
  return { ...state, phase: "revealed" };
}
