import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import {
  assignParticipantsToRooms,
  chooseCoordinator,
} from "@/lib/gathering/assignment";
import { ACTIVE_GATHERING_ID, INPUT_LIMITS } from "@/lib/gathering/constants";
import { GatheringError } from "@/lib/gathering/errors";
import { encryptPrayerRequest } from "@/lib/gathering/prayer-request-crypto";
import type {
  OrganizerSnapshot,
  ParticipantSnapshot,
} from "@/lib/gathering/types";

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

function capacityStatus(
  participantCount: number,
  rooms: { maxCapacity: number | null }[],
) {
  const hasUnlimitedRoom = rooms.some((room) => room.maxCapacity === null);
  const finiteCapacity = rooms.reduce(
    (sum, room) => sum + (room.maxCapacity ?? 0),
    0,
  );
  const capacity = hasUnlimitedRoom ? Number.POSITIVE_INFINITY : finiteCapacity;

  return {
    capacitySufficient: rooms.length > 0 && capacity >= participantCount,
    capacityShortfall:
      rooms.length === 0
        ? participantCount
        : Math.max(0, participantCount - capacity),
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
      room: {
        select: {
          id: true,
          name: true,
          directions: true,
          coordinatorId: true,
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

  if (!participant.room) {
    return {
      state: "LOBBY",
      revision: gathering.revision,
      participant: { id: participant.id, name: participant.displayName },
      participantCount: await database.participant.count({
        where: { gatheringId: ACTIVE_GATHERING_ID },
      }),
    };
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
  };
}

export async function getOrganizerSnapshot(): Promise<OrganizerSnapshot> {
  const database = getDatabase();
  const gathering = await ensureGathering(database);
  const [participantCount, rooms] = await Promise.all([
    database.participant.count({
      where: { gatheringId: ACTIVE_GATHERING_ID },
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
      },
    }),
  ]);
  const status = capacityStatus(participantCount, rooms);

  return {
    phase: gathering.phase,
    revision: gathering.revision,
    participantCount,
    ...status,
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      directions: room.directions,
      maxCapacity: room.maxCapacity,
      memberCount: room.participants.length,
      coordinatorName: room.coordinator?.displayName ?? null,
      members: room.participants.map((participant) => ({
        id: participant.id,
        name: participant.displayName,
        isCoordinator: participant.id === room.coordinatorId,
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

    let roomId: string | null = null;
    let assignedAt: Date | null = null;

    if (gathering.phase === "ASSIGNED") {
      const rooms = await transaction.room.findMany({
        where: { gatheringId: ACTIVE_GATHERING_ID },
        include: { _count: { select: { participants: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const eligible = rooms.filter(
        (room) =>
          room.maxCapacity === null ||
          room._count.participants < room.maxCapacity,
      );
      const smallest = Math.min(
        ...eligible.map((room) => room._count.participants),
      );
      const candidates = eligible.filter(
        (room) => room._count.participants === smallest,
      );
      const room = candidates[Math.floor(Math.random() * candidates.length)];

      if (!room) {
        throw new GatheringError(
          "No room can accept another participant.",
          "NO_ROOM_CAPACITY",
          409,
        );
      }

      roomId = room.id;
      assignedAt = new Date();
    }

    const participant = await transaction.participant.create({
      data: {
        gatheringId: ACTIVE_GATHERING_ID,
        displayName,
        sessionTokenHash: input.sessionTokenHash,
        prayerCiphertext: encrypted?.ciphertext,
        prayerIv: encrypted?.iv,
        prayerAuthTag: encrypted?.authTag,
        roomId,
        assignedAt,
      },
    });
    if (roomId) {
      await transaction.room.updateMany({
        where: { id: roomId, coordinatorId: null },
        data: { coordinatorId: participant.id },
      });
    }
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
  });
}

export async function addRoom(input: {
  name: string;
  directions: string;
  maxCapacity: number | null;
}): Promise<void> {
  const name = normalizedText(input.name, INPUT_LIMITS.roomName);
  const directions = input.directions
    .trim()
    .slice(0, INPUT_LIMITS.roomDirections);
  if (!name) {
    throw new GatheringError("Give the room a name.", "ROOM_NAME_REQUIRED");
  }

  await serializedTransaction(async (transaction) => {
    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    if (gathering.phase !== "FORMING") {
      throw new GatheringError(
        "Rooms are locked after launch.",
        "ROOMS_LOCKED",
        409,
      );
    }

    const roomCount = await transaction.room.count({
      where: { gatheringId: ACTIVE_GATHERING_ID },
    });
    if (roomCount === 0 && input.maxCapacity !== null) {
      throw new GatheringError(
        "The first room must have unlimited capacity.",
        "UNLIMITED_ROOM_REQUIRED",
      );
    }

    await transaction.room.create({
      data: {
        gatheringId: ACTIVE_GATHERING_ID,
        name,
        directions,
        maxCapacity: input.maxCapacity,
      },
    });
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
  });
}

export async function updateRoom(input: {
  id: string;
  name: string;
  directions: string;
  maxCapacity: number | null;
}): Promise<void> {
  const name = normalizedText(input.name, INPUT_LIMITS.roomName);
  const directions = input.directions
    .trim()
    .slice(0, INPUT_LIMITS.roomDirections);
  if (!name) {
    throw new GatheringError("Give the room a name.", "ROOM_NAME_REQUIRED");
  }

  await serializedTransaction(async (transaction) => {
    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    if (gathering.phase !== "FORMING") {
      throw new GatheringError(
        "Rooms are locked after launch.",
        "ROOMS_LOCKED",
        409,
      );
    }

    const rooms = await transaction.room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      select: { id: true, maxCapacity: true },
    });
    if (!rooms.some((room) => room.id === input.id)) {
      throw new GatheringError("Room not found.", "ROOM_NOT_FOUND", 404);
    }
    if (
      input.maxCapacity !== null &&
      !rooms.some((room) => room.id !== input.id && room.maxCapacity === null)
    ) {
      throw new GatheringError(
        "At least one room must have unlimited capacity.",
        "UNLIMITED_ROOM_REQUIRED",
      );
    }

    await transaction.room.update({
      where: { id: input.id },
      data: { name, directions, maxCapacity: input.maxCapacity },
    });
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { revision: { increment: 1 } },
    });
  });
}

export async function removeRoom(roomId: string): Promise<void> {
  await serializedTransaction(async (transaction) => {
    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    if (gathering.phase !== "FORMING") {
      throw new GatheringError(
        "Rooms are locked after launch.",
        "ROOMS_LOCKED",
        409,
      );
    }

    const rooms = await transaction.room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      select: { id: true, maxCapacity: true },
    });
    const room = rooms.find(({ id }) => id === roomId);
    if (!room) {
      throw new GatheringError("Room not found.", "ROOM_NOT_FOUND", 404);
    }
    const remaining = rooms.filter(({ id }) => id !== roomId);
    if (
      remaining.length > 0 &&
      !remaining.some(({ maxCapacity }) => maxCapacity === null)
    ) {
      throw new GatheringError(
        "At least one room must have unlimited capacity.",
        "UNLIMITED_ROOM_REQUIRED",
      );
    }

    await transaction.room.delete({ where: { id: roomId } });
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

    const [rooms, participants] = await Promise.all([
      transaction.room.findMany({
        where: { gatheringId: ACTIVE_GATHERING_ID },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      transaction.participant.findMany({
        where: { gatheringId: ACTIVE_GATHERING_ID },
        select: { id: true },
      }),
    ]);

    let assignments: Map<string, string[]>;
    try {
      assignments = assignParticipantsToRooms(
        participants.map(({ id }) => id),
        rooms,
      );
    } catch (error) {
      throw new GatheringError(
        error instanceof Error ? error.message : "Assignment could not launch.",
        "LAUNCH_BLOCKED",
        409,
      );
    }

    const assignedAt = new Date();
    for (const [roomId, participantIds] of assignments) {
      if (participantIds.length > 0) {
        await transaction.participant.updateMany({
          where: { id: { in: participantIds } },
          data: { roomId, assignedAt },
        });
      }
      await transaction.room.update({
        where: { id: roomId },
        data: { coordinatorId: chooseCoordinator(participantIds) },
      });
    }
    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: {
        phase: "ASSIGNED",
        launchedAt: assignedAt,
        revision: { increment: 1 },
      },
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
      select: { id: true, roomId: true },
    });
    if (!participant?.roomId) {
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
