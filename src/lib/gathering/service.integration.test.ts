import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/lib/db";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";
import {
  getOrganizerSnapshot,
  getParticipantSnapshot,
  joinParticipant,
  launchGathering,
  resetGathering,
  takeOverCoordinator,
} from "@/lib/gathering/service";

async function clearGathering() {
  const database = getDatabase();
  await database.room.updateMany({
    where: { gatheringId: ACTIVE_GATHERING_ID },
    data: { coordinatorId: null },
  });
  await database.participant.deleteMany({
    where: { gatheringId: ACTIVE_GATHERING_ID },
  });
  await database.room.deleteMany({
    where: { gatheringId: ACTIVE_GATHERING_ID },
  });
  await database.gathering.deleteMany({
    where: { id: ACTIVE_GATHERING_ID },
  });
}

async function seedRooms(
  rooms: {
    name: string;
    directions?: string;
    maxCapacity: number | null;
  }[],
) {
  await getOrganizerSnapshot();
  const database = getDatabase();
  for (const [index, room] of rooms.entries()) {
    await database.room.create({
      data: {
        gatheringId: ACTIVE_GATHERING_ID,
        name: room.name,
        directions: room.directions ?? "",
        maxCapacity: room.maxCapacity,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      },
    });
  }
}

describe("gathering lifecycle", () => {
  beforeEach(clearGathering);
  afterAll(async () => {
    await clearGathering();
    await disconnectDatabase();
  });

  it("enforces the minimum finite room capacity in PostgreSQL", async () => {
    await getOrganizerSnapshot();
    await expect(
      getDatabase().room.create({
        data: {
          gatheringId: ACTIVE_GATHERING_ID,
          name: "Single Seat",
          maxCapacity: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it("joins, launches, takes over, accepts a late arrival, and resets", async () => {
    await seedRooms([
      {
        name: "Olive Grove",
        directions: "Level 2",
        maxCapacity: null,
      },
      {
        name: "Upper Room",
        directions: "Beside reception",
        maxCapacity: 3,
      },
    ]);

    for (let index = 0; index < 5; index += 1) {
      await joinParticipant({
        displayName: `Participant ${index + 1}`,
        prayerRequest: `Private request ${index + 1}`,
        sessionTokenHash: String(index + 1).padStart(64, "0"),
      });
    }

    const beforeLaunch = await getOrganizerSnapshot();
    expect(beforeLaunch).toMatchObject({
      phase: "FORMING",
      participantCount: 5,
      capacitySufficient: true,
    });
    expect(beforeLaunch.rooms.map(({ memberCount }) => memberCount)).toEqual([
      3, 2,
    ]);
    const storedCoordinators = await getDatabase().room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { coordinator: { select: { displayName: true } } },
    });
    expect(
      storedCoordinators.map(({ coordinator }) => coordinator?.displayName),
    ).toEqual(["Participant 1", "Participant 3"]);
    expect(
      beforeLaunch.rooms.map(({ coordinatorName }) => coordinatorName),
    ).toEqual([null, null]);
    expect(
      beforeLaunch.rooms
        .flatMap(({ members }) => members)
        .some(({ isCoordinator }) => isCoordinator),
    ).toBe(false);
    expect(JSON.stringify(beforeLaunch)).not.toContain("Private request");
    expect(await getParticipantSnapshot("1".padStart(64, "0"))).toMatchObject({
      state: "LOBBY",
    });
    await expect(
      takeOverCoordinator("1".padStart(64, "0")),
    ).rejects.toMatchObject({ code: "NOT_REVEALED" });
    const provisionalMembership = beforeLaunch.rooms.map((room) =>
      room.members.map(({ id }) => id),
    );

    await launchGathering();
    const assigned = await getOrganizerSnapshot();
    expect(assigned.phase).toBe("ASSIGNED");
    expect(
      assigned.rooms.map((room) => room.members.map(({ id }) => id)),
    ).toEqual(provisionalMembership);
    expect(
      assigned.rooms.map(({ coordinatorName }) => coordinatorName),
    ).toEqual(["Participant 1", "Participant 3"]);

    const first = await getParticipantSnapshot("1".padStart(64, "0"));
    expect(first.state).toBe("ROOM");
    await takeOverCoordinator("4".padStart(64, "0"));
    const afterTakeover = await getParticipantSnapshot("4".padStart(64, "0"));
    expect(
      afterTakeover.state === "ROOM" &&
        afterTakeover.room.members.find(
          ({ id }) => id === afterTakeover.participant.id,
        )?.isCoordinator,
    ).toBe(true);

    await joinParticipant({
      displayName: "Late Participant",
      prayerRequest: "Late private request",
      sessionTokenHash: "late".padStart(64, "0"),
    });
    expect((await getParticipantSnapshot("late".padStart(64, "0"))).state).toBe(
      "ROOM",
    );
    expect(
      (await getOrganizerSnapshot()).rooms.find(
        ({ name }) => name === "Upper Room",
      )?.coordinatorName,
    ).toBe("Participant 4");

    await resetGathering();
    expect(await getParticipantSnapshot("1".padStart(64, "0"))).toMatchObject({
      state: "JOIN",
    });
    const reset = await getOrganizerSnapshot();
    expect(reset).toMatchObject({ phase: "FORMING", participantCount: 0 });
    expect(reset.rooms).toHaveLength(2);
  });

  it("makes the first late arrival coordinator of an empty room", async () => {
    await seedRooms([
      {
        name: "Olive Grove",
        directions: "Level 2",
        maxCapacity: null,
      },
      {
        name: "Upper Room",
        directions: "Beside reception",
        maxCapacity: null,
      },
    ]);
    await joinParticipant({
      displayName: "Initial Participant",
      prayerRequest: "",
      sessionTokenHash: "initial".padStart(64, "0"),
    });
    await launchGathering();
    await joinParticipant({
      displayName: "Late Coordinator",
      prayerRequest: "",
      sessionTokenHash: "late-coordinator".padStart(64, "0"),
    });

    const snapshot = await getParticipantSnapshot(
      "late-coordinator".padStart(64, "0"),
    );
    expect(snapshot.state).toBe("ROOM");
    expect(snapshot.state === "ROOM" && snapshot.room.name).toBe("Upper Room");
    expect(
      snapshot.state === "ROOM" &&
        snapshot.room.members.find(({ id }) => id === snapshot.participant.id)
          ?.isCoordinator,
    ).toBe(true);
  });

  it("preserves first-join coordination for a room formed before rollout", async () => {
    await seedRooms([
      {
        name: "Olive Grove",
        directions: "Level 2",
        maxCapacity: null,
      },
    ]);
    await joinParticipant({
      displayName: "First Participant",
      prayerRequest: "",
      sessionTokenHash: "first".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Second Participant",
      prayerRequest: "",
      sessionTokenHash: "second".padStart(64, "0"),
    });
    await getDatabase().room.updateMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      data: { coordinatorId: null },
    });
    await joinParticipant({
      displayName: "Post-rollout Participant",
      prayerRequest: "",
      sessionTokenHash: "post-rollout".padStart(64, "0"),
    });

    await launchGathering();

    expect((await getOrganizerSnapshot()).rooms[0]?.coordinatorName).toBe(
      "First Participant",
    );
  });

  it("keeps reveal atomic without recalculating room membership", async () => {
    await seedRooms([
      { name: "First Unlimited Room", maxCapacity: null },
      { name: "Second Unlimited Room", maxCapacity: null },
    ]);
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        joinParticipant({
          displayName: `Concurrent ${index + 1}`,
          prayerRequest: "",
          sessionTokenHash: `concurrent-${index}`.padStart(64, "0"),
        }),
      ),
    );

    const launches = await Promise.allSettled([
      launchGathering(),
      launchGathering(),
    ]);
    expect(
      launches.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(launches.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );

    const launched = await getOrganizerSnapshot();
    expect(launched).toMatchObject({
      phase: "ASSIGNED",
      participantCount: 12,
    });
    expect(launched.rooms.map(({ memberCount }) => memberCount)).toEqual([
      6, 6,
    ]);
  });

  it("rejects a join when the room configuration is empty", async () => {
    await expect(
      joinParticipant({
        displayName: "Waiting Participant",
        prayerRequest: "",
        sessionTokenHash: "waiting".padStart(64, "0"),
      }),
    ).rejects.toMatchObject({ code: "ROOM_CONFIGURATION_INVALID" });
    expect(await getOrganizerSnapshot()).toMatchObject({
      phase: "FORMING",
      participantCount: 0,
    });
  });
});
