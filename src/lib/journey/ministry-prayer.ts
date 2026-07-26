export type MinistryPrayerSection = {
  heading: string;
  points: string[];
};

export type MinistryPrayerBundle = {
  id: string;
  ministry: string;
  sections: MinistryPrayerSection[];
};

export type MinistryPrayerConfiguration = {
  bundlesPerRoom: number;
  bundles: MinistryPrayerBundle[];
};

export type MinistryPrayerState = {
  bundleIds: string[];
  bundleIndex: number;
  assignments: string[][];
  bundleStartedAt: string;
};

export type MinistryPrayerParticipant = { id: string };
type Random = () => number;

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

export function validateMinistryPrayerConfiguration(
  value: unknown,
): MinistryPrayerConfiguration | undefined {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (
    !candidate ||
    candidate.bundlesPerRoom !== 5 ||
    !Array.isArray(candidate.bundles) ||
    candidate.bundles.length < 5 ||
    candidate.bundles.length > 100
  ) {
    return undefined;
  }

  const bundles: MinistryPrayerBundle[] = [];
  const bundleIds = new Set<string>();
  for (const value of candidate.bundles) {
    const bundle =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    if (
      !bundle ||
      !nonEmptyString(bundle.id, 100) ||
      bundleIds.has(bundle.id) ||
      !nonEmptyString(bundle.ministry, 200) ||
      !Array.isArray(bundle.sections) ||
      bundle.sections.length === 0 ||
      bundle.sections.length > 8
    ) {
      return undefined;
    }
    const sections: MinistryPrayerSection[] = [];
    for (const value of bundle.sections) {
      const section =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      if (
        !section ||
        !nonEmptyString(section.heading, 200) ||
        !Array.isArray(section.points) ||
        section.points.length === 0 ||
        section.points.length > 20 ||
        !section.points.every((point) => nonEmptyString(point, 3_000))
      ) {
        return undefined;
      }
      sections.push({
        heading: section.heading,
        points: [...section.points] as string[],
      });
    }
    bundleIds.add(bundle.id);
    bundles.push({ id: bundle.id, ministry: bundle.ministry, sections });
  }

  return { bundlesPerRoom: 5, bundles };
}

function createBundleSequence(
  configuration: MinistryPrayerConfiguration,
  length: number,
): string[] {
  const ministryOrder = [
    ...new Set(configuration.bundles.map(({ ministry }) => ministry)),
  ];
  const ministryQueues = new Map(
    ministryOrder.map((ministry) => [
      ministry,
      configuration.bundles
        .filter((bundle) => bundle.ministry === ministry)
        .map(({ id }) => id),
    ]),
  );
  const sequence: string[] = [];
  while (sequence.length < configuration.bundles.length) {
    ministryOrder.forEach((ministry) => {
      const next = ministryQueues.get(ministry)?.shift();
      if (next) sequence.push(next);
    });
  }
  const useCount = new Map(sequence.map((id) => [id, 1]));
  const ministryById = new Map(
    configuration.bundles.map(({ id, ministry }) => [id, ministry]),
  );

  while (sequence.length < length) {
    const roomStart =
      Math.floor(sequence.length / configuration.bundlesPerRoom) *
      configuration.bundlesPerRoom;
    const roomIds = sequence.slice(roomStart);
    const roomMinistries = new Set(
      roomIds.map((id) => ministryById.get(id)).filter(Boolean),
    );
    const candidates = configuration.bundles
      .filter(({ id }) => !roomIds.includes(id))
      .sort((left, right) => {
        const leftInRoom = roomMinistries.has(left.ministry) ? 1 : 0;
        const rightInRoom = roomMinistries.has(right.ministry) ? 1 : 0;
        return (
          leftInRoom - rightInRoom ||
          (useCount.get(left.id) ?? 0) - (useCount.get(right.id) ?? 0) ||
          configuration.bundles.indexOf(left) -
            configuration.bundles.indexOf(right)
        );
      });
    const next = candidates[0] ?? configuration.bundles[0];
    if (!next) break;
    sequence.push(next.id);
    useCount.set(next.id, (useCount.get(next.id) ?? 0) + 1);
  }
  return sequence.slice(0, length);
}

export function allocateMinistryPrayerBundles(
  configuration: MinistryPrayerConfiguration,
  roomIndex: number,
): string[] {
  if (!Number.isSafeInteger(roomIndex) || roomIndex < 0) {
    throw new Error("Room index must be a non-negative integer.");
  }
  const start = roomIndex * configuration.bundlesPerRoom;
  return createBundleSequence(
    configuration,
    start + configuration.bundlesPerRoom,
  ).slice(start);
}

function shuffled<T>(values: T[], random: Random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [
      result[swapIndex] as T,
      result[index] as T,
    ];
  }
  return result;
}

export function createMinistryPrayerAssignments(
  bundleCount: number,
  participantIds: string[],
  random: Random = Math.random,
): string[][] {
  const people = shuffled([...new Set(participantIds)], random);
  if (people.length === 0) return Array.from({ length: bundleCount }, () => []);
  if (people.length === 1)
    return Array.from({ length: bundleCount }, () => [people[0] as string]);
  if (people.length === 2)
    return Array.from({ length: bundleCount }, () => [...people]);

  const assignments: string[][] = [];
  const usage = new Map(people.map((id) => [id, 0]));
  const pairs = new Set<string>();
  while (assignments.length < bundleCount) {
    const candidates: [string, string][] = [];
    for (let left = 0; left < people.length; left += 1) {
      for (let right = left + 1; right < people.length; right += 1) {
        candidates.push([people[left] as string, people[right] as string]);
      }
    }
    candidates.sort((left, right) => {
      const leftKey = [...left].sort().join(":");
      const rightKey = [...right].sort().join(":");
      return (
        (pairs.has(leftKey) ? 1 : 0) - (pairs.has(rightKey) ? 1 : 0) ||
        left.reduce((total, id) => total + (usage.get(id) ?? 0), 0) -
          right.reduce((total, id) => total + (usage.get(id) ?? 0), 0) ||
        Math.max(...left.map((id) => usage.get(id) ?? 0)) -
          Math.max(...right.map((id) => usage.get(id) ?? 0))
      );
    });
    const pair = candidates[0] as [string, string];
    assignments.push(pair);
    pair.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1));
    pairs.add([...pair].sort().join(":"));
  }
  return assignments;
}

export function createMinistryPrayerState(
  configuration: MinistryPrayerConfiguration,
  roomIndex: number,
  participants: MinistryPrayerParticipant[],
  startedAt: Date,
  random: Random = Math.random,
): MinistryPrayerState {
  const bundleIds = allocateMinistryPrayerBundles(configuration, roomIndex);
  return {
    bundleIds,
    bundleIndex: 0,
    assignments: createMinistryPrayerAssignments(
      bundleIds.length,
      participants.map(({ id }) => id),
      random,
    ),
    bundleStartedAt: startedAt.toISOString(),
  };
}

export function parseMinistryPrayerState(
  value: unknown,
  configuration: MinistryPrayerConfiguration,
): MinistryPrayerState | undefined {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const configuredIds = new Set(configuration.bundles.map(({ id }) => id));
  if (
    !candidate ||
    !Array.isArray(candidate.bundleIds) ||
    candidate.bundleIds.length !== configuration.bundlesPerRoom ||
    !candidate.bundleIds.every(
      (id) => typeof id === "string" && configuredIds.has(id),
    ) ||
    new Set(candidate.bundleIds).size !== candidate.bundleIds.length ||
    !Number.isInteger(candidate.bundleIndex) ||
    (candidate.bundleIndex as number) < 0 ||
    (candidate.bundleIndex as number) >= candidate.bundleIds.length ||
    !Array.isArray(candidate.assignments) ||
    candidate.assignments.length !== candidate.bundleIds.length ||
    !candidate.assignments.every(
      (assignment) =>
        Array.isArray(assignment) &&
        assignment.length >= 1 &&
        assignment.length <= 2 &&
        assignment.every(
          (participantId) =>
            typeof participantId === "string" && participantId.length > 0,
        ) &&
        new Set(assignment).size === assignment.length,
    ) ||
    typeof candidate.bundleStartedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.bundleStartedAt))
  ) {
    return undefined;
  }
  return {
    bundleIds: candidate.bundleIds as string[],
    bundleIndex: candidate.bundleIndex as number,
    assignments: candidate.assignments as string[][],
    bundleStartedAt: candidate.bundleStartedAt,
  };
}

export function getMinistryPrayerBundleSeconds(
  recommendedSeconds: number,
  configuration: MinistryPrayerConfiguration,
): number {
  return Math.floor(recommendedSeconds / configuration.bundlesPerRoom);
}

export function reassignMinistryPrayerParticipant(
  state: MinistryPrayerState,
  participants: MinistryPrayerParticipant[],
  targetParticipantId: string,
  random: Random = Math.random,
): { state: MinistryPrayerState; changed: boolean } {
  const currentPair = state.assignments[state.bundleIndex] ?? [];
  const targetIndex = currentPair.indexOf(targetParticipantId);
  if (targetIndex === -1) return { state, changed: false };

  const usage = new Map<string, number>();
  state.assignments.flat().forEach((id) => {
    usage.set(id, (usage.get(id) ?? 0) + 1);
  });
  const candidates = shuffled(
    participants.filter(({ id }) => !currentPair.includes(id)),
    random,
  ).sort(
    (left, right) => (usage.get(left.id) ?? 0) - (usage.get(right.id) ?? 0),
  );
  const replacement = candidates[0];
  if (!replacement) return { state, changed: false };

  const assignments = state.assignments.map((pair) => [...pair]);
  const nextPair = [...currentPair];
  nextPair[targetIndex] = replacement.id;
  assignments[state.bundleIndex] = nextPair;
  return { changed: true, state: { ...state, assignments } };
}
