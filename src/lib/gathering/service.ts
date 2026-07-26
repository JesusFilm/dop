import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import {
  pickNextRoom,
  pickSmallestEligibleRoom,
  validateRoomConfiguration,
} from "@/lib/gathering/assignment";
import { ACTIVE_GATHERING_ID, INPUT_LIMITS } from "@/lib/gathering/constants";
import { GatheringError } from "@/lib/gathering/errors";
import { encryptPrayerRequest } from "@/lib/gathering/prayer-request-crypto";
import type {
  OrganizerSnapshot,
  ParticipantSnapshot,
} from "@/lib/gathering/types";
import { validateJourneyModule } from "@/lib/journey/registry";
import { getValidJourney } from "@/lib/journey/service";

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
          coordinatorId: true,
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
        journey = {
          state: "ACTIVE",
          journeyName: runtime.journey.name,
          expectedState: runtime.currentModule.id,
          joinedInProgress,
          module: {
            id: runtime.currentModule.id,
            title: runtime.currentModule.title,
            recommendedSeconds: runtime.currentModule.recommendedSeconds,
            ...clientModule,
            startedAt: runtime.moduleStartedAt.toISOString(),
            serverTime: new Date().toISOString(),
          },
        };
      } catch {
        journey = undefined;
      }
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
        isCoordinator: member.id === participant.room?.coordinatorId,
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
          coordinator: { select: { displayName: true } },
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
      coordinatorName:
        gathering.phase === "ASSIGNED"
          ? (room.coordinator?.displayName ?? null)
          : null,
      journeyState: organizerJourneyState(
        validJourney ? room.journeyRuntime : null,
      ),
      members: room.participants.map((participant) => ({
        id: participant.id,
        name: participant.displayName,
        isCoordinator:
          gathering.phase === "ASSIGNED" &&
          participant.id === room.coordinatorId,
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

  await serializedTransaction(async (transaction) => {
    const existing = await transaction.participant.findUnique({
      where: { sessionTokenHash: input.sessionTokenHash },
      select: { id: true },
    });
    if (existing) return;

    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    const encrypted = prayerRequest
      ? encryptPrayerRequest(prayerRequest)
      : null;

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
        prayerCiphertext: encrypted?.ciphertext,
        prayerIv: encrypted?.iv,
        prayerAuthTag: encrypted?.authTag,
        roomId: room.id,
        assignedAt: new Date(),
      },
    });
    if (room.participantCount === 0) {
      await transaction.room.updateMany({
        where: { id: room.id, coordinatorId: null },
        data: { coordinatorId: participant.id },
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
        where: { id: room.id, coordinatorId: null },
        data: { coordinatorId: firstParticipant.id },
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
        room: { select: { coordinatorId: true } },
        gathering: { select: { phase: true } },
      },
    });
    if (
      !participant?.roomId ||
      participant.room?.coordinatorId !== participant.id
    ) {
      throw new GatheringError(
        "Only the room coordinator can continue the journey.",
        "COORDINATOR_REQUIRED",
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

    const currentState =
      runtime.completedAt !== null
        ? "completed"
        : (runtime.currentModuleId ?? "gathering");
    if (input.expectedState !== currentState) return;
    if (runtime.completedAt) return;

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
    const nextModule = validJourney.modules[currentIndex + 1];
    const now = new Date();
    await transaction.roomJourney.update({
      where: { id: runtime.id },
      data: nextModule
        ? {
            currentModuleId: nextModule.id,
            moduleStartedAt: now,
            moduleState: Prisma.DbNull,
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

export async function takeOverCoordinator(
  sessionTokenHash: string,
): Promise<void> {
  await serializedTransaction(async (transaction) => {
    const participant = await transaction.participant.findFirst({
      where: {
        sessionTokenHash,
        gatheringId: ACTIVE_GATHERING_ID,
      },
      select: {
        id: true,
        roomId: true,
        gathering: { select: { phase: true } },
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
        "Coordinator takeover is available after room assignments are revealed.",
        "NOT_REVEALED",
        409,
      );
    }
    if (!participant.roomId) {
      throw new GatheringError(
        "Only an assigned room member can take over.",
        "NOT_ASSIGNED",
        403,
      );
    }

    await transaction.room.update({
      where: { id: participant.roomId },
      data: { coordinatorId: participant.id },
    });
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
      data: { coordinatorId: null },
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
