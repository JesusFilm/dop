import {
  getMinistryPrayerBundleSeconds,
  parseMinistryPrayerState,
} from "@/lib/journey/ministry-prayer";
import {
  buildShortStudyContributions,
  parseShortStudyState,
} from "@/lib/journey/short-study";
import type {
  MinistryPrayerPresentation,
  PresentedJourneyModule,
  ShortStudyPresentation,
  ValidJourneyModule,
} from "@/lib/journey/types";

type Room = {
  leaderId: string | null;
  participants: { id: string; displayName: string }[];
};

function buildShortStudyPresentation(input: {
  module: Extract<ValidJourneyModule, { behaviorKey: "short-study" }>;
  moduleState: unknown;
  room: Room;
  viewerId: string;
}): ShortStudyPresentation {
  const state = parseShortStudyState(
    input.moduleState,
    input.module.configuration,
  );
  if (!state) throw new Error("Invalid Short Study state");

  const contributions = buildShortStudyContributions(
    input.module.configuration,
  );
  const contribution = contributions[state.contributionIndex];
  if (!contribution) throw new Error("Invalid Short Study contribution");

  const readerId =
    contribution.kind === "discussion"
      ? input.room.leaderId
      : state.assignments[state.contributionIndex];
  const readerMember = input.room.participants.find(
    ({ id }) => id === readerId,
  );
  const viewerIsLeader = input.viewerId === input.room.leaderId;

  return {
    contribution,
    contributionNumber: state.contributionIndex + 1,
    contributionCount: contributions.length,
    reader: readerMember
      ? { id: readerMember.id, name: readerMember.displayName }
      : null,
    viewerRole: viewerIsLeader
      ? "leader"
      : readerId === input.viewerId
        ? "reader"
        : "member",
    canReassign:
      viewerIsLeader &&
      contribution.kind !== "discussion" &&
      input.room.participants.some(
        ({ id }) => id !== input.room.leaderId && id !== readerId,
      ),
  };
}

function buildMinistryPrayerPresentation(input: {
  module: Extract<ValidJourneyModule, { behaviorKey: "ministry-prayer" }>;
  moduleState: unknown;
  room: Room;
  viewerId: string;
}): MinistryPrayerPresentation {
  const state = parseMinistryPrayerState(
    input.moduleState,
    input.module.configuration,
  );
  if (!state) throw new Error("Invalid Ministry Prayer state");
  const bundleId = state.bundleIds[state.bundleIndex];
  const bundle = input.module.configuration.bundles.find(
    ({ id }) => id === bundleId,
  );
  if (!bundle) throw new Error("Invalid Ministry Prayer bundle");
  const assigneeIds = state.assignments[state.bundleIndex] ?? [];
  const assignees = assigneeIds.flatMap((id) => {
    const member = input.room.participants.find(
      (participant) => participant.id === id,
    );
    return member ? [{ id: member.id, name: member.displayName }] : [];
  });
  const viewerIsLeader = input.viewerId === input.room.leaderId;

  return {
    bundle,
    bundleNumber: state.bundleIndex + 1,
    bundleCount: state.bundleIds.length,
    assignees,
    viewerRole: viewerIsLeader
      ? "leader"
      : assigneeIds.includes(input.viewerId)
        ? "assigned"
        : "member",
    canReassign:
      viewerIsLeader &&
      assigneeIds.some((id) =>
        input.room.participants.some(
          (participant) =>
            participant.id !== id && !assigneeIds.includes(participant.id),
        ),
      ),
    bundleStartedAt: state.bundleStartedAt,
    bundleRecommendedSeconds: getMinistryPrayerBundleSeconds(
      input.module.recommendedSeconds,
      input.module.configuration,
    ),
  };
}

export function presentJourneyModule(input: {
  module: Exclude<ValidJourneyModule, { behaviorKey: "personal-prayer" }>;
  moduleState: unknown;
  room: Room;
  viewerId: string;
}): { module: PresentedJourneyModule; stateIndex?: number } {
  if (input.module.behaviorKey === "short-study") {
    const shortStudy = buildShortStudyPresentation({
      ...input,
      module: input.module,
    });
    return {
      module: {
        behaviorKey: "short-study",
        configuration: {
          translation: input.module.configuration.translation,
        },
        shortStudy,
      },
      stateIndex: shortStudy.contributionNumber - 1,
    };
  }
  if (input.module.behaviorKey === "ministry-prayer") {
    const ministryPrayer = buildMinistryPrayerPresentation({
      ...input,
      module: input.module,
    });
    return {
      module: {
        behaviorKey: "ministry-prayer",
        configuration: {
          bundlesPerRoom: input.module.configuration.bundlesPerRoom,
        },
        ministryPrayer,
      },
      stateIndex: ministryPrayer.bundleNumber - 1,
    };
  }
  return { module: input.module };
}
