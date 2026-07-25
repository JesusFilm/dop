export interface AssignableRoom {
  id: string;
  maxCapacity: number | null;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function assignParticipantsToRooms(
  participantIds: readonly string[],
  rooms: readonly AssignableRoom[],
  random: () => number = Math.random,
): Map<string, string[]> {
  if (rooms.length === 0) {
    throw new Error("At least one room is required for assignment.");
  }

  const totalCapacity = rooms.reduce<number | null>((capacity, room) => {
    if (capacity === null || room.maxCapacity === null) {
      return null;
    }

    return capacity + room.maxCapacity;
  }, 0);

  if (totalCapacity !== null && totalCapacity < participantIds.length) {
    throw new Error("The configured rooms do not have enough capacity.");
  }

  const assignments = new Map(rooms.map((room) => [room.id, [] as string[]]));

  for (const participantId of shuffled(participantIds, random)) {
    const eligibleRooms = rooms.filter((room) => {
      const members = assignments.get(room.id);
      return (
        members !== undefined &&
        (room.maxCapacity === null || members.length < room.maxCapacity)
      );
    });

    const smallestRoomSize = Math.min(
      ...eligibleRooms.map((room) => assignments.get(room.id)?.length ?? 0),
    );
    const smallestRooms = eligibleRooms.filter(
      (room) => assignments.get(room.id)?.length === smallestRoomSize,
    );
    const room =
      smallestRooms[Math.floor(random() * smallestRooms.length)] ??
      smallestRooms[0];

    if (!room) {
      throw new Error("The configured rooms do not have enough capacity.");
    }

    assignments.get(room.id)?.push(participantId);
  }

  return assignments;
}

export function chooseCoordinator(
  participantIds: readonly string[],
  random: () => number = Math.random,
): string | null {
  if (participantIds.length === 0) {
    return null;
  }

  return (
    participantIds[Math.floor(random() * participantIds.length)] ??
    participantIds[0]
  );
}
