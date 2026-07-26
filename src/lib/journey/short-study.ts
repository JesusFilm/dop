import { shuffled, type Random } from "@/lib/journey/random";

export type ShortStudyConfiguration = {
  passageReference: string;
  scriptureText: string;
  translation: string;
  reflections: string[];
  discussionQuestion: string;
};

export type ShortStudyContribution = {
  id: string;
  kind: "passage" | "reflection" | "discussion";
  label: string;
  text: string;
};

export type ShortStudyState = {
  contributionIndex: number;
  assignments: (string | null)[];
};

type Participant = { id: string };

function nonEmptyString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

export function validateShortStudyConfiguration(
  value: unknown,
): ShortStudyConfiguration | undefined {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (
    !candidate ||
    !nonEmptyString(candidate.passageReference, 100) ||
    !nonEmptyString(candidate.scriptureText, 10_000) ||
    !nonEmptyString(candidate.translation, 100) ||
    !Array.isArray(candidate.reflections) ||
    candidate.reflections.length === 0 ||
    candidate.reflections.length > 12 ||
    !candidate.reflections.every((item) => nonEmptyString(item, 2_000)) ||
    !nonEmptyString(candidate.discussionQuestion, 1_000)
  ) {
    return undefined;
  }

  return {
    passageReference: candidate.passageReference,
    scriptureText: candidate.scriptureText,
    translation: candidate.translation,
    reflections: candidate.reflections,
    discussionQuestion: candidate.discussionQuestion,
  };
}

export function buildShortStudyContributions(
  configuration: ShortStudyConfiguration,
): ShortStudyContribution[] {
  return [
    {
      id: "passage",
      kind: "passage",
      label: configuration.passageReference,
      text: configuration.scriptureText,
    },
    ...configuration.reflections.map((text, index) => ({
      id: `reflection-${index}`,
      kind: "reflection" as const,
      label: `Reflection ${index + 1}`,
      text,
    })),
    {
      id: "discussion",
      kind: "discussion",
      label: "Discuss together",
      text: configuration.discussionQuestion,
    },
  ];
}

function createAssignments(
  count: number,
  participantIds: string[],
  random: Random,
): (string | null)[] {
  if (participantIds.length === 0)
    return Array<string | null>(count).fill(null);

  const assignments: string[] = [];
  while (assignments.length < count) {
    assignments.push(...shuffled(participantIds, random));
  }
  return assignments.slice(0, count);
}

export function createShortStudyState(
  configuration: ShortStudyConfiguration,
  participants: Participant[],
  leaderId: string,
  random: Random = Math.random,
): ShortStudyState {
  const readingCount = buildShortStudyContributions(configuration).length - 1;
  return {
    contributionIndex: 0,
    assignments: createAssignments(
      readingCount,
      participants.filter(({ id }) => id !== leaderId).map(({ id }) => id),
      random,
    ),
  };
}

export function parseShortStudyState(
  value: unknown,
  configuration: ShortStudyConfiguration,
): ShortStudyState | undefined {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const contributions = buildShortStudyContributions(configuration);
  if (
    !candidate ||
    !Number.isInteger(candidate.contributionIndex) ||
    (candidate.contributionIndex as number) < 0 ||
    (candidate.contributionIndex as number) >= contributions.length ||
    !Array.isArray(candidate.assignments) ||
    candidate.assignments.length !== contributions.length - 1 ||
    !candidate.assignments.every(
      (assignment) => assignment === null || typeof assignment === "string",
    )
  ) {
    return undefined;
  }
  return {
    contributionIndex: candidate.contributionIndex as number,
    assignments: candidate.assignments as (string | null)[],
  };
}

export function reassignCurrentReader(
  state: ShortStudyState,
  participants: Participant[],
  leaderId: string,
  random: Random = Math.random,
): { state: ShortStudyState; changed: boolean } {
  const readingCount = state.assignments.length;
  if (state.contributionIndex >= readingCount) {
    return { state, changed: false };
  }
  const currentReader = state.assignments[state.contributionIndex];
  const candidates = participants.filter(
    ({ id }) => id !== leaderId && id !== currentReader,
  );
  if (candidates.length === 0) return { state, changed: false };

  const selected =
    candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
  const assignments = [...state.assignments];
  assignments[state.contributionIndex] = selected?.id ?? null;
  return {
    changed: assignments[state.contributionIndex] !== currentReader,
    state: { ...state, assignments },
  };
}

export function reconcileShortStudyLeader(
  state: ShortStudyState,
  participants: Participant[],
  leaderId: string,
  random: Random = Math.random,
): ShortStudyState {
  const readingCount = state.assignments.length;
  const assignments = [...state.assignments];
  const unfinishedStart = Math.min(state.contributionIndex, readingCount);
  const replacementIndexes = assignments.flatMap((assignment, index) =>
    index >= unfinishedStart && assignment === leaderId ? [index] : [],
  );
  const replacements = createAssignments(
    replacementIndexes.length,
    participants.filter(({ id }) => id !== leaderId).map(({ id }) => id),
    random,
  );
  replacementIndexes.forEach((index, replacementIndex) => {
    assignments[index] = replacements[replacementIndex] ?? null;
  });
  return { ...state, assignments };
}
