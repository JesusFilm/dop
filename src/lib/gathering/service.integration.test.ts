import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/lib/db";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";
import {
  advanceRoomJourney,
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
  await database.journey.deleteMany();
}

async function seedJourney() {
  await getOrganizerSnapshot();
  const journey = await getDatabase().journey.create({
    data: {
      name: "Prayer journey",
      modules: {
        create: [
          {
            position: 0,
            behaviorKey: "test-guided-prayer",
            title: "Prayer and praise",
            recommendedSeconds: 1_800,
            configuration: { prompt: "Pray together." },
          },
          {
            position: 1,
            behaviorKey: "test-guided-prayer",
            title: "Reflection",
            recommendedSeconds: 1_800,
            configuration: { prompt: "Reflect together." },
          },
        ],
      },
    },
  });
  await getDatabase().gathering.update({
    where: { id: ACTIVE_GATHERING_ID },
    data: { journeyId: journey.id },
  });
  return journey;
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
  beforeEach(async () => {
    process.env.JOURNEY_TEST_MODULES = "enabled";
    process.env.PRAYER_REQUEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    await clearGathering();
  });
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
      prayerRequestCount: 5,
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

  it("runs independent room journeys with replay-safe coordinator progression", async () => {
    const journey = await seedJourney();
    await seedRooms([
      { name: "Olive Grove", maxCapacity: null },
      { name: "Upper Room", maxCapacity: null },
    ]);
    await joinParticipant({
      displayName: "First coordinator",
      prayerRequest: "",
      sessionTokenHash: "first-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Second coordinator",
      prayerRequest: "",
      sessionTokenHash: "second-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Third coordinator",
      prayerRequest: "",
      sessionTokenHash: "third-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Fourth participant",
      prayerRequest: "",
      sessionTokenHash: "fourth-journey".padStart(64, "0"),
    });

    await launchGathering();
    const gathering = await getParticipantSnapshot(
      "first-journey".padStart(64, "0"),
    );
    expect(gathering).toMatchObject({
      state: "ROOM",
      journey: { state: "GATHERING", expectedState: "gathering" },
    });

    const tokenHash = "first-journey".padStart(64, "0");
    await Promise.all([
      advanceRoomJourney({
        sessionTokenHash: tokenHash,
        expectedState: "gathering",
      }),
      advanceRoomJourney({
        sessionTokenHash: tokenHash,
        expectedState: "gathering",
      }),
    ]);
    const active = await getParticipantSnapshot(tokenHash);
    expect(active).toMatchObject({
      state: "ROOM",
      journey: {
        state: "ACTIVE",
        module: { title: "Prayer and praise", recommendedSeconds: 1_800 },
      },
    });
    const firstModuleId =
      active.state === "ROOM" && active.journey?.state === "ACTIVE"
        ? active.journey.module.id
        : "";
    const firstStartedAt =
      active.state === "ROOM" && active.journey?.state === "ACTIVE"
        ? active.journey.module.startedAt
        : "";

    const otherJourney = await getDatabase().journey.create({
      data: {
        name: "Other journey",
        modules: {
          create: {
            position: 0,
            behaviorKey: "test-guided-prayer",
            title: "Other module",
            recommendedSeconds: 3_600,
            configuration: { prompt: "Other prompt." },
          },
        },
      },
      include: { modules: true },
    });
    const activeRoom = await getDatabase().room.findFirstOrThrow({
      where: { participants: { some: { sessionTokenHash: tokenHash } } },
    });
    await expect(
      getDatabase().roomJourney.update({
        where: { roomId: activeRoom.id },
        data: { currentModuleId: otherJourney.modules[0]!.id },
      }),
    ).rejects.toThrow();

    await expect(
      advanceRoomJourney({
        sessionTokenHash: "second-journey".padStart(64, "0"),
        expectedState: firstModuleId,
      }),
    ).rejects.toMatchObject({ code: "COORDINATOR_REQUIRED" });
    await joinParticipant({
      displayName: "Late participant",
      prayerRequest: "",
      sessionTokenHash: "late-journey".padStart(64, "0"),
    });
    expect(
      await getParticipantSnapshot("late-journey".padStart(64, "0")),
    ).toMatchObject({
      journey: {
        state: "ACTIVE",
        joinedInProgress: true,
        module: { startedAt: firstStartedAt },
      },
    });
    await takeOverCoordinator("second-journey".padStart(64, "0"));
    const afterTakeover = await getParticipantSnapshot(
      "second-journey".padStart(64, "0"),
    );
    expect(afterTakeover).toMatchObject({
      journey: {
        state: "ACTIVE",
        module: { id: firstModuleId, startedAt: firstStartedAt },
      },
    });
    const activeCoordinatorToken = "second-journey".padStart(64, "0");

    await advanceRoomJourney({
      sessionTokenHash: activeCoordinatorToken,
      expectedState: firstModuleId,
    });
    const secondModule = await getParticipantSnapshot(activeCoordinatorToken);
    expect(secondModule).toMatchObject({
      journey: { state: "ACTIVE", module: { title: "Reflection" } },
    });
    const secondModuleId =
      secondModule.state === "ROOM" && secondModule.journey?.state === "ACTIVE"
        ? secondModule.journey.module.id
        : "";
    await advanceRoomJourney({
      sessionTokenHash: activeCoordinatorToken,
      expectedState: secondModuleId,
    });
    expect(await getParticipantSnapshot(activeCoordinatorToken)).toMatchObject({
      journey: { state: "COMPLETED" },
    });
    expect(
      await getParticipantSnapshot("third-journey".padStart(64, "0")),
    ).toMatchObject({
      journey: { state: "GATHERING" },
    });

    await resetGathering();
    expect(
      await getDatabase().journey.findUnique({ where: { id: journey.id } }),
    ).not.toBeNull();
    expect(await getDatabase().roomJourney.count()).toBe(0);
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
