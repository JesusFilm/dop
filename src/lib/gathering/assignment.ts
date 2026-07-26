export interface AssignableRoom {
  id: string;
  maxCapacity: number | null;
}

type CountedRoom = AssignableRoom & { participantCount: number };

function canAcceptParticipant(room: CountedRoom): boolean {
  return room.maxCapacity === null || room.participantCount < room.maxCapacity;
}

function firstSmallestRoom<T extends CountedRoom>(
  rooms: readonly T[],
): T | null {
  let smallest: T | null = null;
  for (const room of rooms) {
    if (
      canAcceptParticipant(room) &&
      (smallest === null || room.participantCount < smallest.participantCount)
    ) {
      smallest = room;
    }
  }
  return smallest;
}

export function validateRoomConfiguration(
  rooms: readonly AssignableRoom[],
): void {
  if (rooms.length === 0) {
    throw new Error("At least one room is required for assignment.");
  }
  if (
    rooms.some(({ maxCapacity }) => maxCapacity !== null && maxCapacity < 2)
  ) {
    throw new Error("Finite room capacity must be at least two.");
  }
  if (!rooms.some(({ maxCapacity }) => maxCapacity === null)) {
    throw new Error("At least one room must have unlimited capacity.");
  }
}

export function pickNextRoom<T extends CountedRoom>(
  rooms: readonly T[],
): T | null {
  const roomNeedingPair = rooms.find(
    (room) => canAcceptParticipant(room) && room.participantCount < 2,
  );
  if (roomNeedingPair) return roomNeedingPair;

  return firstSmallestRoom(rooms);
}

export function pickSmallestEligibleRoom<T extends CountedRoom>(
  rooms: readonly T[],
): T | null {
  return firstSmallestRoom(rooms);
}
