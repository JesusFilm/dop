import type { PrismaClient } from "@/generated/prisma/client";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";

export const INITIAL_ROOMS = [
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f01",
    name: "Auditorium",
    directions: "Downstairs",
    maxCapacity: null,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f02",
    name: "Boardroom 2",
    directions: "Downstairs",
    maxCapacity: 8,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f03",
    name: "Journey Room",
    directions: "Downstairs",
    maxCapacity: 8,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f04",
    name: "Boardroom",
    directions: "Upstairs",
    maxCapacity: 8,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f05",
    name: "Breakout space",
    directions: "",
    maxCapacity: null,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f06",
    name: "Meeting room",
    directions: "Upstairs",
    maxCapacity: 4,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f07",
    name: "Quiet room",
    directions: "Upstairs",
    maxCapacity: 4,
  },
  {
    id: "d7bf3e83-f18d-42dd-870b-0c9e18f39f08",
    name: "Creative Meeting Room",
    directions: "Downstairs",
    maxCapacity: 8,
  },
] as const;

export async function seedInitialRooms(
  database: PrismaClient,
): Promise<number> {
  return database.$transaction(async (transaction) => {
    const gathering = await transaction.gathering.upsert({
      where: { id: ACTIVE_GATHERING_ID },
      create: { id: ACTIVE_GATHERING_ID },
      update: {},
    });

    if (gathering.phase !== "FORMING") {
      return 0;
    }

    const existingRooms = await transaction.room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      select: { name: true },
    });
    const existingNames = new Set(existingRooms.map(({ name }) => name));
    const roomsToCreate = INITIAL_ROOMS.filter(
      ({ name }) => !existingNames.has(name),
    );

    if (roomsToCreate.length === 0) {
      return 0;
    }

    const result = await transaction.room.createMany({
      data: roomsToCreate.map((room) => ({
        ...room,
        gatheringId: ACTIVE_GATHERING_ID,
      })),
      skipDuplicates: true,
    });

    return result.count;
  });
}
