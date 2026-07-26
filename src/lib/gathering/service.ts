import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import {
  pickNextRoom,
  pickSmallestEligibleRoom,
  validateRoomConfiguration,
} from "@/lib/gathering/assignment";
import { ACTIVE_GATHERING_ID, INPUT_LIMITS } from "@/lib/gathering/constants";
import { GatheringError } from "@/lib/gathering/errors";
import {
  decryptPrayerRequest,
  encryptPrayerRequest,
} from "@/lib/gathering/prayer-request-crypto";
import type {
  OrganizerSnapshot,
  ParticipantSnapshot,
} from "@/lib/gathering/types";
import { validateJourneyModule } from "@/lib/journey/registry";
import { getValidJourney } from "@/lib/journey/service";
import {
  buildShortStudyContributions,
  createShortStudyState,
  parseShortStudyState,
  reassignCurrentReader,
  reconcileShortStudyLeader,
  type ShortStudyConfiguration,
} from "@/lib/journey/short-study";
import {
  addParticipantToPersonalPrayerState,
  createPersonalPrayerState,
  parsePersonalPrayerState,
  revealPersonalPrayerState,
} from "@/lib/journey/personal-prayer";
import type {
  PersonalPrayerPresentation,
  ShortStudyPresentation,
} from "@/lib/journey/types";

type Transaction = Prisma.TransactionClient;

const MAX_TRANSACTION_ATTEMPTS = 8;

function normalizedText(value: string, limit: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

async function ensureGathering(database: Transaction | PrismaClient) {
  return database.gathering.upsert({
    where: { id: ACTIVE_GATHERING_ID },
    create: { id: ACTIVE_GATHERING_ID },
    update: {},
  });
}

async function lockGathering(transaction: Transaction) {
  await ensureGathering(transaction);
  await transaction.$queryRaw`
    SELECT "id"
    FROM "Gathering"
    WHERE "id" = ${ACTIVE_GATHERING_ID}
    FOR UPDATE
  `;
}

function isWriteConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const databaseCode =
    typeof error.meta?.code === "string" ? error.meta.code : undefined;
  return (
    error.code === "P2034" ||
    databaseCode === "40001" ||
    error.message.includes("40001")
  );
}

async function serializedTransaction<T>(
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const database = getDatabase();

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await database.$transaction(async (transaction) => {
        await lockGathering(transaction);
        return operation(transaction);
      });
    } catch (error) {
      if (!isWriteConflict(error) || attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.ceil(Math.random() * attempt * 10)),
      );
    }
  }

  throw new Error("Gathering transaction retry limit reached.");
}

function capacityStatus(rooms: { id: string; maxCapacity: number | null }[]) {
  let configurationValid = true;
  try {
    validateRoomConfiguration(rooms);
  } catch {
    configurationValid = false;
  }

  return {
    capacitySufficient: configurationValid,
  };
}

function organizerJourneyState(
  runtime: {
    currentModuleId: string | null;
    completedAt: Date | null;
  } | null,
): "unavailable" | "gathering" | "active" | "completed" {
  if (!runtime) return "unavailable";
  if (runtime.completedAt) return "completed";
  if (runtime.currentModuleId) return "active";
  return "gathering";
}

function assertValidRoomConfiguration(
  rooms: { id: string; maxCapacity: number | null }[],
): void {
  try {
    validateRoomConfiguration(rooms);
  } catch (error) {
    throw new GatheringError(
      error instanceof Error ? error.message : "Room configuration is invalid.",
      "ROOM_CONFIGURATION_INVALID",
      409,
    );
  }
}

function buildShortStudyPresentation(input: {
  configuration: ShortStudyConfiguration;
  moduleState: Prisma.JsonValue | null;
  room: {
    leaderId: string | null;
    participants: { id: string; displayName: string }[];
  };
  viewerId: string;
}): ShortStudyPresentation {
  const state = parseShortStudyState(input.moduleState, input.configuration);
  if (!state) throw new Error("Invalid Short Study state");

  const contributions = buildShortStudyContributions(input.configuration);
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

async function buildPersonalPrayerPresentation(input: {
  database: PrismaClient;
  moduleState: Prisma.JsonValue | null;
  room: {
    participants: { id: string; displayName: string }[];
  };
  viewerId: string;
}): Promise<PersonalPrayerPresentation> {
  const state = parsePersonalPrayerState(input.moduleState);
  if (!state) throw new Error("Invalid Personal prayer state");

  const group = state.groups.find((candidate) =>
    candidate.includes(input.viewerId),
  );
  if (!group) throw new Error("Viewer has no Personal prayer group");

  const requests =
    state.phase === "revealed"
      ? await input.database.participant.findMany({
          where: { id: { in: group } },
          select: {
            id: true,
            prayerCiphertext: true,
            prayerIv: true,
            prayerAuthTag: true,
          },
        })
      : [];
  const requestsByParticipant = new Map(
    requests.map((participant) => [
      participant.id,
      participant.prayerCiphertext &&
      participant.prayerIv &&
      participant.prayerAuthTag
        ? decryptPrayerRequest({
            ciphertext: participant.prayerCiphertext,
            iv: participant.prayerIv,
            authTag: participant.prayerAuthTag,
          })
        : null,
    ]),
  );
  const membersById = new Map(
    input.room.participants.map((participant) => [participant.id, participant]),
  );

  return {
    phase: state.phase,
    members: group.flatMap((participantId) => {
      const participant = membersById.get(participantId);
      if (!participant) return [];
      return [
        {
          id: participant.id,
          name: participant.displayName,
          ...(state.phase === "revealed"
            ? { request: requestsByParticipant.get(participant.id) ?? null }
            : {}),
        },
      ];
    }),
  };
}

export async function getParticipantSnapshot(
  sessionTokenHash?: string,
): Promise<ParticipantSnapshot> {
  const database = getDatabase();
  const gathering = await ensureGathering(database);

  if (!sessionTokenHash) {
    return { state: "JOIN", revision: gathering.revision };
  }

  const participant = await database.participant.findUnique({
    where: { sessionTokenHash },
    select: {
      id: true,
      displayName: true,
      gatheringId: true,
      joinedAt: true,
      room: {
        select: {
          id: true,
          name: true,
          directions: true,
          leaderId: true,
          journeyRuntime: {
            select: {
              journeyId: true,
              journey: { select: { name: true } },
              currentModuleId: true,
              currentModule: {
                select: {
                  id: true,
                  behaviorKey: true,
                  title: true,
                  recommendedSeconds: true,
                  configuration: true,
                },
              },
              moduleStartedAt: true,
              completedAt: true,
              moduleState: true,
            },
          },
          participants: {
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            select: { id: true, displayName: true },
          },
        },
      },
    },
  });

  if (!participant || participant.gatheringId !== ACTIVE_GATHERING_ID) {
    return { state: "JOIN", revision: gathering.revision };
  }

  if (gathering.phase === "FORMING" || !participant.room) {
    return {
      state: "LOBBY",
      revision: gathering.revision,
      participant: { id: participant.id, name: participant.displayName },
      participantCount: await database.participant.count({
        where: { gatheringId: ACTIVE_GATHERING_ID },
      }),
    };
  }

  const runtime = participant.room.journeyRuntime;
  const joinedInProgress =
    gathering.launchedAt !== null &&
    participant.joinedAt.getTime() > gathering.launchedAt.getTime();
  let journey: Extract<ParticipantSnapshot, { state: "ROOM" }>["journey"];

  if (runtime) {
    if (runtime.completedAt) {
      journey = {
        state: "COMPLETED",
        journeyName: runtime.journey.name,
        expectedState: "completed",
        joinedInProgress,
      };
    } else if (!runtime.currentModuleId || !runtime.moduleStartedAt) {
      journey = {
        state: "GATHERING",
        journeyName: runtime.journey.name,
        expectedState: "gathering",
        joinedInProgress,
      };
    } else if (runtime.currentModule) {
      try {
        const clientModule = validateJourneyModule(
          runtime.currentModule.behaviorKey,
          runtime.currentModule.configuration,
        );
        const shortStudy =
          clientModule.behaviorKey === "short-study"
            ? buildShortStudyPresentation({
                configuration: clientModule.configuration,
                moduleState: runtime.moduleState,
                room: participant.room,
                viewerId: participant.id,
              })
            : undefined;
        const personalPrayer =
          clientModule.behaviorKey === "personal-prayer"
            ? await buildPersonalPrayerPresentation({
                database,
                moduleState: runtime.moduleState,
                room: participant.room,
                viewerId: participant.id,
              })
            : undefined;
        const presentedModule =
          clientModule.behaviorKey === "short-study"
            ? {
                behaviorKey: "short-study" as const,
                configuration: {
                  translation: clientModule.configuration.translation,
                },
                shortStudy: shortStudy!,
              }
            : clientModule.behaviorKey === "personal-prayer"
              ? {
                  behaviorKey: "personal-prayer" as const,
                  configuration: clientModule.configuration,
                  personalPrayer: personalPrayer!,
                }
              : clientModule;
        journey = {
          state: "ACTIVE",
          journeyName: runtime.journey.name,
          expectedState: shortStudy
            ? `${runtime.currentModule.id}:${shortStudy.contributionNumber - 1}`
            : personalPrayer
              ? `${runtime.currentModule.id}:${personalPrayer.phase}`
              : runtime.currentModule.id,
          joinedInProgress,
          module: {
            id: runtime.currentModule.id,
            title: runtime.currentModule.title,
            recommendedSeconds: runtime.currentModule.recommendedSeconds,
            ...presentedModule,
            startedAt: runtime.moduleStartedAt.toISOString(),
            serverTime: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error("Journey module could not be presented", {
          behaviorKey: runtime.currentModule.behaviorKey,
          moduleId: runtime.currentModule.id,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : "Unknown error",
        });
        journey = undefined;
      }
    } else {
      console.error("Journey runtime has no matching current module", {
        currentModuleId: runtime.currentModuleId,
        roomId: participant.room.id,
      });
    }
  }

  return {
    state: "ROOM",
    revision: gathering.revision,
    participant: { id: participant.id, name: participant.displayName },
    room: {
      id: participant.room.id,
      name: participant.room.name,
      directions: participant.room.directions,
      members: participant.room.participants.map((member) => ({
        id: member.id,
        name: member.displayName,
        isLeader: member.id === participant.room?.leaderId,
      })),
    },
    ...(journey ? { journey } : {}),
  };
}

export async function getOrganizerSnapshot(): Promise<OrganizerSnapshot> {
  const database = getDatabase();
  const gathering = await ensureGathering(database);
  const [participantCount, prayerRequestCount, rooms, validJourney] =
    await Promise.all([
      database.participant.count({
        where: { gatheringId: ACTIVE_GATHERING_ID },
      }),
      database.participant.count({
        where: {
          gatheringId: ACTIVE_GATHERING_ID,
          prayerCiphertext: { not: null },
        },
      }),
      database.room.findMany({
        where: { gatheringId: ACTIVE_GATHERING_ID },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          participants: {
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            select: { id: true, displayName: true },
          },
          leader: { select: { displayName: true } },
          journeyRuntime: {
            select: { currentModuleId: true, completedAt: true },
          },
        },
      }),
      getValidJourney(database, gathering.journeyId),
    ]);
  const status = capacityStatus(rooms);

  return {
    phase: gathering.phase,
    revision: gathering.revision,
    participantCount,
    prayerRequestCount,
    ...status,
    journey: {
      available: validJourney !== null,
      name: validJourney?.name ?? null,
    },
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      directions: room.directions,
      maxCapacity: room.maxCapacity,
      memberCount: room.participants.length,
      leaderName: room.leader?.displayName ?? null,
      journeyState: organizerJourneyState(
        validJourney ? room.journeyRuntime : null,
      ),
      members: room.participants.map((participant) => ({
        id: participant.id,
        name: participant.displayName,
        isLeader: participant.id === room.leaderId,
      })),
    })),
  };
}

export async function joinParticipant(input: {
  displayName: string;
  prayerRequest: string;
  sessionTokenHash: string;
}): Promise<void> {
  const displayName = normalizedText(
    input.displayName,
    INPUT_LIMITS.participantName,
  );
  const prayerRequest = input.prayerRequest
    .trim()
    .slice(0, INPUT_LIMITS.prayerRequest);

  if (!displayName) {
    throw new GatheringError("Enter your name to join.", "NAME_REQUIRED");
  }
  if (!prayerRequest) {
    throw new GatheringError(
      "Enter a personal prayer request to join.",
      "PRAYER_REQUEST_REQUIRED",
    );
  }

  await serializedTransaction(async (transaction) => {
    const existing = await transaction.participant.findUnique({
      where: { sessionTokenHash: input.sessionTokenHash },
      select: { id: true },
    });
    if (existing) return;

    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    const encrypted = encryptPrayerRequest(prayerRequest);

    const rooms = await transaction.room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      include: { _count: { select: { participants: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    assertValidRoomConfiguration(rooms);
    const assignmentRooms = rooms.map((candidate) => ({
      ...candidate,
      participantCount: candidate._count.participants,
    }));
    const room =
      gathering.phase === "FORMING"
        ? pickNextRoom(assignmentRooms)
        : pickSmallestEligibleRoom(assignmentRooms);
    if (!room) {
      throw new GatheringError(
        "No room can accept another participant.",
        "ROOM_CONFIGURATION_INVALID",
        409,
      );
    }

    const participant = await transaction.participant.create({
      data: {
        gatheringId: ACTIVE_GATHERING_ID,
        displayName,
        sessionTokenHash: input.sessionTokenHash,
        prayerCiphertext: encrypted.ciphertext,
        prayerIv: encrypted.iv,
        prayerAuthTag: encrypted.authTag,
        roomId: room.id,
        assignedAt: new Date(),
      },
    });
    const roomJourney =
      gathering.phase === "ASSIGNED"
        ? await transaction.roomJourney.findUnique({
            where: { roomId: room.id },
            select: {
              id: true,
              moduleState: true,
              currentModule: { select: { behaviorKey: true } },
            },
          })
        : null;
    if (roomJourney?.currentModule?.behaviorKey === "personal-prayer") {
      const state = parsePersonalPrayerState(roomJourney.moduleState);
      if (!state) {
        throw new GatheringError(
          "The room journey state is invalid.",
          "JOURNEY_STATE_INVALID",
          409,
        );
      }
      await transaction.roomJourney.update({
        where: { id: roomJourney.id },
        data: {
          moduleState: addParticipantToPersonalPrayerState(
            state,
            participant.id,
          ),
        },
      });
    }
    if (room.participantCount === 0) {
      await transaction.room.updateMany({
        where: { id: room.id, leaderId: null },
        data: { leaderId: participant.id },
      });
    }
    if (gathering.phase === "ASSIGNED") {
      const validJourney = await getValidJourney(
        transaction,
        gathering.journeyId,
      );
      if (validJourney) {
        await transaction.roomJourney.upsert({
          where: { roomId: room.id },
          create: { roomId: room.id, journeyId: validJourney.id },
          update: {},
        });
      }
    }
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
  });
}

export async function launchGathering(): Promise<void> {
  await serializedTransaction(async (transaction) => {
    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    if (gathering.phase !== "FORMING") {
      throw new GatheringError(
        "This gathering has already launched.",
        "ALREADY_LAUNCHED",
        409,
      );
    }

    const rooms = await transaction.room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        participants: {
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: { id: true },
        },
      },
    });
    assertValidRoomConfiguration(rooms);
    const validJourney = await getValidJourney(
      transaction,
      gathering.journeyId,
    );

    for (const room of rooms) {
      const firstParticipant = room.participants[0];
      if (!firstParticipant) continue;

      await transaction.room.updateMany({
        where: { id: room.id, leaderId: null },
        data: { leaderId: firstParticipant.id },
      });
      if (validJourney) {
        await transaction.roomJourney.upsert({
          where: { roomId: room.id },
          create: { roomId: room.id, journeyId: validJourney.id },
          update: {
            journeyId: validJourney.id,
            currentModuleId: null,
            moduleStartedAt: null,
            completedAt: null,
            moduleState: Prisma.DbNull,
          },
        });
      }
    }
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: {
        phase: "ASSIGNED",
        launchedAt: new Date(),
        revision: { increment: 1 },
      },
    });
  });
}

export async function advanceRoomJourney(input: {
  sessionTokenHash: string;
  expectedState: string;
  expectedRevision: number;
}): Promise<void> {
  await serializedTransaction(async (transaction) => {
    const participant = await transaction.participant.findFirst({
      where: {
        sessionTokenHash: input.sessionTokenHash,
        gatheringId: ACTIVE_GATHERING_ID,
      },
      select: {
        id: true,
        roomId: true,
        room: {
          select: {
            leaderId: true,
          },
        },
        gathering: { select: { phase: true, revision: true } },
      },
    });
    if (!participant?.roomId || participant.room?.leaderId !== participant.id) {
      throw new GatheringError(
        "Only the room leader can continue the journey.",
        "LEADER_REQUIRED",
        403,
      );
    }
    if (participant.gathering.phase !== "ASSIGNED") {
      throw new GatheringError(
        "Room assignments have not been revealed.",
        "NOT_REVEALED",
        409,
      );
    }
    if (participant.gathering.revision !== input.expectedRevision) {
      return;
    }

    const runtime = await transaction.roomJourney.findUnique({
      where: { roomId: participant.roomId },
    });
    if (!runtime) {
      throw new GatheringError(
        "No guided journey is available for this room.",
        "JOURNEY_UNAVAILABLE",
        409,
      );
    }
    const validJourney = await getValidJourney(transaction, runtime.journeyId);
    if (!validJourney) {
      throw new GatheringError(
        "The guided journey is unavailable.",
        "JOURNEY_UNAVAILABLE",
        409,
      );
    }

    const currentIndex = runtime.currentModuleId
      ? validJourney.modules.findIndex(
          ({ id }) => id === runtime.currentModuleId,
        )
      : -1;
    if (runtime.currentModuleId && currentIndex === -1) {
      throw new GatheringError(
        "The room journey state is invalid.",
        "JOURNEY_STATE_INVALID",
        409,
      );
    }
    const currentModule =
      currentIndex >= 0 ? validJourney.modules[currentIndex] : undefined;
    const currentShortStudyState =
      currentModule?.behaviorKey === "short-study"
        ? parseShortStudyState(runtime.moduleState, currentModule.configuration)
        : undefined;
    const currentPersonalPrayerState =
      currentModule?.behaviorKey === "personal-prayer"
        ? parsePersonalPrayerState(runtime.moduleState)
        : undefined;
    if (
      currentModule?.behaviorKey === "short-study" &&
      !currentShortStudyState
    ) {
      throw new GatheringError(
        "The room journey state is invalid.",
        "JOURNEY_STATE_INVALID",
        409,
      );
    }
    if (
      currentModule?.behaviorKey === "personal-prayer" &&
      !currentPersonalPrayerState
    ) {
      throw new GatheringError(
        "The room journey state is invalid.",
        "JOURNEY_STATE_INVALID",
        409,
      );
    }
    const currentState = runtime.completedAt
      ? "completed"
      : currentModule?.behaviorKey === "short-study" && currentShortStudyState
        ? `${currentModule.id}:${currentShortStudyState.contributionIndex}`
        : currentModule?.behaviorKey === "personal-prayer" &&
            currentPersonalPrayerState
          ? `${currentModule.id}:${currentPersonalPrayerState.phase}`
          : (runtime.currentModuleId ?? "gathering");
    if (input.expectedState !== currentState) return;
    if (runtime.completedAt) return;

    if (
      currentModule?.behaviorKey === "short-study" &&
      currentShortStudyState
    ) {
      const contributionCount = buildShortStudyContributions(
        currentModule.configuration,
      ).length;
      if (currentShortStudyState.contributionIndex < contributionCount - 1) {
        await transaction.roomJourney.update({
          where: { id: runtime.id },
          data: {
            moduleState: {
              ...currentShortStudyState,
              contributionIndex: currentShortStudyState.contributionIndex + 1,
            },
          },
        });
        await transaction.gathering.update({
          where: { id: ACTIVE_GATHERING_ID },
          data: { revision: { increment: 1 } },
        });
        return;
      }
    }
    if (
      currentModule?.behaviorKey === "personal-prayer" &&
      currentPersonalPrayerState?.phase === "grouping"
    ) {
      await transaction.roomJourney.update({
        where: { id: runtime.id },
        data: {
          moduleState: revealPersonalPrayerState(currentPersonalPrayerState),
          moduleStartedAt: new Date(),
        },
      });
      await transaction.gathering.update({
        where: { id: ACTIVE_GATHERING_ID },
        data: { revision: { increment: 1 } },
      });
      return;
    }

    const nextModule = validJourney.modules[currentIndex + 1];
    const now = new Date();
    const roomParticipants =
      nextModule?.behaviorKey === "short-study" ||
      nextModule?.behaviorKey === "personal-prayer"
        ? await transaction.participant.findMany({
            where: { roomId: participant.roomId },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            select: { id: true },
          })
        : [];
    const nextModuleState =
      nextModule?.behaviorKey === "short-study"
        ? createShortStudyState(
            nextModule.configuration,
            roomParticipants,
            participant.id,
          )
        : nextModule?.behaviorKey === "personal-prayer"
          ? createPersonalPrayerState(roomParticipants)
          : null;
    await transaction.roomJourney.update({
      where: { id: runtime.id },
      data: nextModule
        ? {
            currentModuleId: nextModule.id,
            moduleStartedAt: now,
            moduleState: nextModuleState ?? Prisma.DbNull,
          }
        : {
            currentModuleId: null,
            moduleStartedAt: null,
            completedAt: now,
            moduleState: Prisma.DbNull,
          },
    });
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
  });
}

export async function reassignShortStudyReader(input: {
  sessionTokenHash: string;
  expectedState: string;
  expectedRevision: number;
}): Promise<"changed" | "stale" | "unavailable"> {
  return serializedTransaction(async (transaction) => {
    const participant = await transaction.participant.findFirst({
      where: {
        sessionTokenHash: input.sessionTokenHash,
        gatheringId: ACTIVE_GATHERING_ID,
      },
      select: {
        id: true,
        roomId: true,
        gathering: { select: { phase: true, revision: true } },
        room: {
          select: {
            leaderId: true,
            participants: {
              orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
              select: { id: true },
            },
            journeyRuntime: {
              select: {
                id: true,
                moduleState: true,
                currentModule: {
                  select: { id: true, behaviorKey: true, configuration: true },
                },
              },
            },
          },
        },
      },
    });
    if (!participant?.roomId || participant.room?.leaderId !== participant.id) {
      throw new GatheringError(
        "Only the room leader can reassign a reader.",
        "LEADER_REQUIRED",
        403,
      );
    }
    if (participant.gathering.phase !== "ASSIGNED") {
      throw new GatheringError(
        "Room assignments have not been revealed.",
        "NOT_REVEALED",
        409,
      );
    }
    if (participant.gathering.revision !== input.expectedRevision) {
      return "stale";
    }
    const runtime = participant.room.journeyRuntime;
    const currentModule = runtime?.currentModule;
    if (!runtime || currentModule?.behaviorKey !== "short-study") {
      throw new GatheringError(
        "This activity does not support reader reassignment.",
        "JOURNEY_STATE_INVALID",
        409,
      );
    }
    const clientModule = validateJourneyModule(
      currentModule.behaviorKey,
      currentModule.configuration,
    );
    if (clientModule.behaviorKey !== "short-study") {
      throw new GatheringError(
        "This activity does not support reader reassignment.",
        "JOURNEY_STATE_INVALID",
        409,
      );
    }
    const state = parseShortStudyState(
      runtime.moduleState,
      clientModule.configuration,
    );
    if (
      !state ||
      input.expectedState !== `${currentModule.id}:${state.contributionIndex}`
    ) {
      return "stale";
    }
    const result = reassignCurrentReader(
      state,
      participant.room.participants,
      participant.id,
    );
    if (!result.changed) return "unavailable";

    await transaction.roomJourney.update({
      where: { id: runtime.id },
      data: { moduleState: result.state },
    });
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
    return "changed";
  });
}

export async function takeOverLeader(input: {
  sessionTokenHash: string;
  expectedRevision: number;
}): Promise<void> {
  await serializedTransaction(async (transaction) => {
    const participant = await transaction.participant.findFirst({
      where: {
        sessionTokenHash: input.sessionTokenHash,
        gatheringId: ACTIVE_GATHERING_ID,
      },
      select: {
        id: true,
        roomId: true,
        gathering: { select: { phase: true, revision: true } },
        room: {
          select: {
            participants: {
              orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
              select: { id: true },
            },
            journeyRuntime: {
              select: {
                id: true,
                moduleState: true,
                currentModule: {
                  select: { behaviorKey: true, configuration: true },
                },
              },
            },
          },
        },
      },
    });
    if (!participant) {
      throw new GatheringError(
        "Only an assigned room member can take over.",
        "NOT_ASSIGNED",
        403,
      );
    }
    if (participant.gathering.phase !== "ASSIGNED") {
      throw new GatheringError(
        "Leader takeover is available after room assignments are revealed.",
        "NOT_REVEALED",
        409,
      );
    }
    if (!participant.roomId || !participant.room) {
      throw new GatheringError(
        "Only an assigned room member can take over.",
        "NOT_ASSIGNED",
        403,
      );
    }
    if (participant.gathering.revision !== input.expectedRevision) {
      throw new GatheringError(
        "The room changed. Please try taking over again.",
        "STALE_STATE",
        409,
      );
    }

    await transaction.room.update({
      where: { id: participant.roomId },
      data: { leaderId: participant.id },
    });
    const runtime = participant.room?.journeyRuntime;
    if (runtime?.currentModule?.behaviorKey === "short-study") {
      const clientModule = validateJourneyModule(
        runtime.currentModule.behaviorKey,
        runtime.currentModule.configuration,
      );
      if (clientModule.behaviorKey === "short-study") {
        const state = parseShortStudyState(
          runtime.moduleState,
          clientModule.configuration,
        );
        if (state) {
          await transaction.roomJourney.update({
            where: { id: runtime.id },
            data: {
              moduleState: reconcileShortStudyLeader(
                state,
                participant.room.participants,
                participant.id,
              ),
            },
          });
        }
      }
    }
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
  });
}

export async function resetGathering(): Promise<void> {
  await serializedTransaction(async (transaction) => {
    await transaction.roomJourney.deleteMany({
      where: { room: { gatheringId: ACTIVE_GATHERING_ID } },
    });
    await transaction.room.updateMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      data: { leaderId: null },
    });
    await transaction.participant.deleteMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
    });
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: {
        phase: "FORMING",
        launchedAt: null,
        revision: { increment: 1 },
      },
    });
  });
}
