import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/lib/db";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";
import {
  advanceRoomJourney,
  getOrganizerSnapshot,
  getParticipantSnapshot,
  joinParticipant,
  launchGathering,
  reassignJourneyParticipant,
  reassignShortStudyReader,
  resetGathering,
  takeOverLeader,
} from "@/lib/gathering/service";
import {
  MINISTRY_PRAYER_MODULE_ID,
  PRODUCTION_JOURNEY_ID,
  SHORT_STUDY_CONFIGURATION,
  SHORT_STUDY_MODULE_ID,
  seedProductionJourney,
} from "@/lib/journey/seed";
import { JULY_MINISTRY_PRAYER_CONFIGURATION } from "@/lib/journey/ministry-prayer-seed";

async function clearGathering() {
  const database = getDatabase();
  await database.room.updateMany({
    where: { gatheringId: ACTIVE_GATHERING_ID },
    data: { leaderId: null },
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
    const storedLeaders = await getDatabase().room.findMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { leader: { select: { displayName: true } } },
    });
    expect(storedLeaders.map(({ leader }) => leader?.displayName)).toEqual([
      "Participant 1",
      "Participant 3",
    ]);
    expect(beforeLaunch.rooms.map(({ leaderName }) => leaderName)).toEqual([
      "Participant 1",
      "Participant 3",
    ]);
    expect(
      beforeLaunch.rooms
        .flatMap(({ members }) => members)
        .some(({ isLeader }) => isLeader),
    ).toBe(true);
    expect(JSON.stringify(beforeLaunch)).not.toContain("Private request");
    expect(await getParticipantSnapshot("1".padStart(64, "0"))).toMatchObject({
      state: "LOBBY",
    });
    await expect(
      takeOverLeader({
        sessionTokenHash: "1".padStart(64, "0"),
        expectedRevision: beforeLaunch.revision,
      }),
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
    expect(assigned.rooms.map(({ leaderName }) => leaderName)).toEqual([
      "Participant 1",
      "Participant 3",
    ]);

    const first = await getParticipantSnapshot("1".padStart(64, "0"));
    expect(first.state).toBe("ROOM");
    await takeOverLeader({
      sessionTokenHash: "4".padStart(64, "0"),
      expectedRevision: assigned.revision,
    });
    await expect(
      takeOverLeader({
        sessionTokenHash: "1".padStart(64, "0"),
        expectedRevision: assigned.revision,
      }),
    ).rejects.toMatchObject({ code: "STALE_STATE" });
    const afterTakeover = await getParticipantSnapshot("4".padStart(64, "0"));
    expect(
      afterTakeover.state === "ROOM" &&
        afterTakeover.room.members.find(
          ({ id }) => id === afterTakeover.participant.id,
        )?.isLeader,
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
      )?.leaderName,
    ).toBe("Participant 4");

    await resetGathering();
    expect(await getParticipantSnapshot("1".padStart(64, "0"))).toMatchObject({
      state: "JOIN",
    });
    const reset = await getOrganizerSnapshot();
    expect(reset).toMatchObject({ phase: "FORMING", participantCount: 0 });
    expect(reset.rooms).toHaveLength(2);
  });

  it("runs independent room journeys with replay-safe leader progression", async () => {
    const journey = await seedJourney();
    await seedRooms([
      { name: "Olive Grove", maxCapacity: null },
      { name: "Upper Room", maxCapacity: null },
    ]);
    await joinParticipant({
      displayName: "First leader",
      prayerRequest: "",
      sessionTokenHash: "first-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Second leader",
      prayerRequest: "",
      sessionTokenHash: "second-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Third leader",
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
        expectedRevision: gathering.revision,
      }),
      advanceRoomJourney({
        sessionTokenHash: tokenHash,
        expectedState: "gathering",
        expectedRevision: gathering.revision,
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
    expect(
      active.state === "ROOM"
        ? active.room.members.map(({ name }) => name)
        : [],
    ).toEqual(["First leader", "Second leader"]);

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
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      advanceRoomJourney({
        sessionTokenHash: "second-journey".padStart(64, "0"),
        expectedState: firstModuleId,
        expectedRevision: active.revision,
      }),
    ).rejects.toMatchObject({ code: "LEADER_REQUIRED" });
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
    const beforeTakeover = await getOrganizerSnapshot();
    await takeOverLeader({
      sessionTokenHash: "second-journey".padStart(64, "0"),
      expectedRevision: beforeTakeover.revision,
    });
    const afterTakeover = await getParticipantSnapshot(
      "second-journey".padStart(64, "0"),
    );
    expect(afterTakeover).toMatchObject({
      journey: {
        state: "ACTIVE",
        module: { id: firstModuleId, startedAt: firstStartedAt },
      },
    });
    const activeLeaderToken = "second-journey".padStart(64, "0");

    await advanceRoomJourney({
      sessionTokenHash: activeLeaderToken,
      expectedState: firstModuleId,
      expectedRevision: afterTakeover.revision,
    });
    const secondModule = await getParticipantSnapshot(activeLeaderToken);
    expect(secondModule).toMatchObject({
      journey: { state: "ACTIVE", module: { title: "Reflection" } },
    });
    const secondModuleId =
      secondModule.state === "ROOM" && secondModule.journey?.state === "ACTIVE"
        ? secondModule.journey.module.id
        : "";
    await advanceRoomJourney({
      sessionTokenHash: activeLeaderToken,
      expectedState: secondModuleId,
      expectedRevision: secondModule.revision,
    });
    expect(await getParticipantSnapshot(activeLeaderToken)).toMatchObject({
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

  it("seeds and synchronizes the production journey contribution and bundle at a time", async () => {
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);
    expect(await seedProductionJourney(getDatabase())).toBe("attached");
    expect(await seedProductionJourney(getDatabase())).toBe("attached");
    expect(
      await getDatabase().gathering.findUnique({
        where: { id: ACTIVE_GATHERING_ID },
        select: { journeyId: true },
      }),
    ).toEqual({ journeyId: PRODUCTION_JOURNEY_ID });
    expect(
      await getDatabase().journeyModule.findUnique({
        where: { id: SHORT_STUDY_MODULE_ID },
        select: {
          behaviorKey: true,
          title: true,
          recommendedSeconds: true,
          configuration: true,
        },
      }),
    ).toEqual({
      behaviorKey: "short-study",
      title: "Why we pray",
      recommendedSeconds: 600,
      configuration: SHORT_STUDY_CONFIGURATION,
    });
    expect(
      await getDatabase().journeyModule.findUnique({
        where: { id: MINISTRY_PRAYER_MODULE_ID },
        select: {
          position: true,
          behaviorKey: true,
          recommendedSeconds: true,
          configuration: true,
        },
      }),
    ).toEqual({
      position: 1,
      behaviorKey: "ministry-prayer",
      recommendedSeconds: 2_400,
      configuration: JULY_MINISTRY_PRAYER_CONFIGURATION,
    });

    for (const [name, token] of [
      ["Ana", "short-ana"],
      ["Ben", "short-ben"],
      ["Chi", "short-chi"],
    ] as const) {
      await joinParticipant({
        displayName: name,
        prayerRequest: "",
        sessionTokenHash: token.padStart(64, "0"),
      });
    }
    await launchGathering();

    let leaderToken = "short-ana".padStart(64, "0");
    const gathering = await getParticipantSnapshot(leaderToken);
    expect(gathering).toMatchObject({
      state: "ROOM",
      journey: { state: "GATHERING" },
    });
    await advanceRoomJourney({
      sessionTokenHash: leaderToken,
      expectedState: "gathering",
      expectedRevision: gathering.revision,
    });

    const active = await getParticipantSnapshot(leaderToken);
    expect(active).toMatchObject({
      journey: {
        state: "ACTIVE",
        expectedState: `${SHORT_STUDY_MODULE_ID}:0`,
        module: {
          behaviorKey: "short-study",
          shortStudy: {
            contribution: { kind: "passage" },
            viewerRole: "leader",
          },
        },
      },
    });
    expect(JSON.stringify(active)).not.toContain("assignments");
    if (
      active.state !== "ROOM" ||
      active.journey?.state !== "ACTIVE" ||
      active.journey.module.behaviorKey !== "short-study"
    ) {
      throw new Error("Expected an active Short Study");
    }
    const originalReader = active.journey.module.shortStudy?.reader?.id;
    expect(originalReader).not.toBe(active.participant.id);

    expect(
      await reassignShortStudyReader({
        sessionTokenHash: leaderToken,
        expectedState: active.journey.expectedState,
        expectedRevision: active.revision,
      }),
    ).toBe("changed");
    const reassigned = await getParticipantSnapshot(leaderToken);
    if (
      reassigned.state !== "ROOM" ||
      reassigned.journey?.state !== "ACTIVE" ||
      reassigned.journey.module.behaviorKey !== "short-study"
    ) {
      throw new Error("Expected a reassigned Short Study");
    }
    expect(reassigned.journey.module.shortStudy?.reader?.id).not.toBe(
      originalReader,
    );
    const newLeaderName = reassigned.journey.module.shortStudy?.reader?.name;
    const newLeaderToken =
      newLeaderName === "Ben"
        ? "short-ben".padStart(64, "0")
        : "short-chi".padStart(64, "0");
    await takeOverLeader({
      sessionTokenHash: newLeaderToken,
      expectedRevision: reassigned.revision,
    });
    const afterStudyTakeover = await getParticipantSnapshot(newLeaderToken);
    expect(afterStudyTakeover).toMatchObject({
      journey: {
        expectedState: reassigned.journey.expectedState,
        module: {
          shortStudy: {
            viewerRole: "leader",
          },
        },
      },
    });
    if (
      afterStudyTakeover.state !== "ROOM" ||
      afterStudyTakeover.journey?.state !== "ACTIVE" ||
      afterStudyTakeover.journey.module.behaviorKey !== "short-study"
    ) {
      throw new Error("Expected the takeover to preserve the Short Study");
    }
    expect(afterStudyTakeover.journey.module.shortStudy?.reader?.id).not.toBe(
      afterStudyTakeover.participant.id,
    );
    leaderToken = newLeaderToken;

    await advanceRoomJourney({
      sessionTokenHash: leaderToken,
      expectedState: active.journey.expectedState,
      expectedRevision: active.revision,
    });
    expect(await getParticipantSnapshot(leaderToken)).toMatchObject({
      journey: { expectedState: `${SHORT_STUDY_MODULE_ID}:0` },
    });

    let current: Awaited<ReturnType<typeof getParticipantSnapshot>> =
      afterStudyTakeover;
    for (let index = 1; index <= 5; index += 1) {
      await advanceRoomJourney({
        sessionTokenHash: leaderToken,
        expectedState:
          current.state === "ROOM" && current.journey?.state === "ACTIVE"
            ? current.journey.expectedState
            : "",
        expectedRevision: current.revision,
      });
      current = await getParticipantSnapshot(leaderToken);
      if (index < 5) {
        expect(current).toMatchObject({
          journey: { expectedState: `${SHORT_STUDY_MODULE_ID}:${index}` },
        });
      }
    }
    expect(current).toMatchObject({
      journey: {
        state: "ACTIVE",
        expectedState: `${MINISTRY_PRAYER_MODULE_ID}:0`,
        module: {
          behaviorKey: "ministry-prayer",
          recommendedSeconds: 2_400,
          ministryPrayer: {
            bundleNumber: 1,
            bundleCount: 5,
            viewerRole: "leader",
            bundleRecommendedSeconds: 480,
          },
        },
      },
    });
    if (
      current.state !== "ROOM" ||
      current.journey?.state !== "ACTIVE" ||
      current.journey.module.behaviorKey !== "ministry-prayer"
    ) {
      throw new Error("Expected active ministry prayer");
    }
    const beforeReassign = current.journey.module.ministryPrayer;
    expect(beforeReassign.assignees).toHaveLength(2);
    const target = beforeReassign.assignees[0];
    expect(target).toBeDefined();
    expect(
      await reassignJourneyParticipant({
        sessionTokenHash: leaderToken,
        expectedState: current.journey.expectedState,
        expectedRevision: current.revision,
        targetParticipantId: target!.id,
      }),
    ).toBe("changed");
    current = await getParticipantSnapshot(leaderToken);
    if (
      current.state !== "ROOM" ||
      current.journey?.state !== "ACTIVE" ||
      current.journey.module.behaviorKey !== "ministry-prayer"
    ) {
      throw new Error("Expected reassigned ministry prayer");
    }
    expect(
      current.journey.module.ministryPrayer.assignees.map(({ id }) => id),
    ).not.toContain(target!.id);
    const moduleStartedAt = current.journey.module.startedAt;
    let bundleStartedAt = current.journey.module.ministryPrayer.bundleStartedAt;
    const ministryStateBeforeTakeover = current.journey.module.ministryPrayer;
    const nextLeader = current.room.members.find(({ isLeader }) => !isLeader);
    expect(nextLeader).toBeDefined();
    const nextLeaderToken =
      nextLeader?.name === "Ana"
        ? "short-ana".padStart(64, "0")
        : nextLeader?.name === "Ben"
          ? "short-ben".padStart(64, "0")
          : "short-chi".padStart(64, "0");
    await takeOverLeader({
      sessionTokenHash: nextLeaderToken,
      expectedRevision: current.revision,
    });
    current = await getParticipantSnapshot(nextLeaderToken);
    expect(current).toMatchObject({
      journey: {
        state: "ACTIVE",
        expectedState: `${MINISTRY_PRAYER_MODULE_ID}:0`,
        module: {
          startedAt: moduleStartedAt,
          ministryPrayer: ministryStateBeforeTakeover,
        },
      },
    });
    if (
      current.state !== "ROOM" ||
      current.journey?.state !== "ACTIVE" ||
      current.journey.module.behaviorKey !== "ministry-prayer"
    ) {
      throw new Error("Expected takeover to preserve ministry prayer");
    }
    leaderToken = nextLeaderToken;

    const duplicateAdvance = {
      sessionTokenHash: leaderToken,
      expectedState: current.journey.expectedState,
      expectedRevision: current.revision,
    };
    await Promise.all([
      advanceRoomJourney(duplicateAdvance),
      advanceRoomJourney(duplicateAdvance),
    ]);
    current = await getParticipantSnapshot(leaderToken);
    expect(current).toMatchObject({
      journey: {
        state: "ACTIVE",
        expectedState: `${MINISTRY_PRAYER_MODULE_ID}:1`,
        module: {
          startedAt: moduleStartedAt,
          ministryPrayer: { bundleNumber: 2 },
        },
      },
    });
    if (
      current.state !== "ROOM" ||
      current.journey?.state !== "ACTIVE" ||
      current.journey.module.behaviorKey !== "ministry-prayer"
    ) {
      throw new Error("Expected one ministry prayer advance");
    }
    expect(
      Date.parse(current.journey.module.ministryPrayer.bundleStartedAt),
    ).toBeGreaterThanOrEqual(Date.parse(bundleStartedAt));
    bundleStartedAt = current.journey.module.ministryPrayer.bundleStartedAt;

    for (let index = 2; index <= 5; index += 1) {
      await advanceRoomJourney({
        sessionTokenHash: leaderToken,
        expectedState:
          current.state === "ROOM" && current.journey?.state === "ACTIVE"
            ? current.journey.expectedState
            : "",
        expectedRevision: current.revision,
      });
      current = await getParticipantSnapshot(leaderToken);
      if (index < 5) {
        expect(current).toMatchObject({
          journey: {
            state: "ACTIVE",
            expectedState: `${MINISTRY_PRAYER_MODULE_ID}:${index}`,
            module: {
              startedAt: moduleStartedAt,
              ministryPrayer: { bundleNumber: index + 1 },
            },
          },
        });
        if (
          current.state !== "ROOM" ||
          current.journey?.state !== "ACTIVE" ||
          current.journey.module.behaviorKey !== "ministry-prayer"
        ) {
          throw new Error("Expected next ministry prayer bundle");
        }
        expect(
          Date.parse(current.journey.module.ministryPrayer.bundleStartedAt),
        ).toBeGreaterThanOrEqual(Date.parse(bundleStartedAt));
        bundleStartedAt = current.journey.module.ministryPrayer.bundleStartedAt;
      }
    }
    expect(current).toMatchObject({ journey: { state: "COMPLETED" } });
  });

  it("repairs only the authorized timing and missing module for a running canonical journey", async () => {
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);
    await seedProductionJourney(getDatabase());
    await joinParticipant({
      displayName: "Ana",
      prayerRequest: "",
      sessionTokenHash: "running-canonical".padStart(64, "0"),
    });
    await launchGathering();
    await getDatabase().journeyModule.update({
      where: { id: SHORT_STUDY_MODULE_ID },
      data: { recommendedSeconds: 3_600 },
    });
    await getDatabase().journeyModule.update({
      where: { id: MINISTRY_PRAYER_MODULE_ID },
      data: { title: "Preserve this running title" },
    });

    expect(await seedProductionJourney(getDatabase())).toBe("attached");
    expect(
      await getDatabase().journeyModule.findMany({
        where: { journeyId: PRODUCTION_JOURNEY_ID },
        orderBy: { position: "asc" },
        select: { id: true, recommendedSeconds: true, title: true },
      }),
    ).toEqual([
      {
        id: SHORT_STUDY_MODULE_ID,
        recommendedSeconds: 600,
        title: "Why we pray",
      },
      {
        id: MINISTRY_PRAYER_MODULE_ID,
        recommendedSeconds: 2_400,
        title: "Preserve this running title",
      },
    ]);

    await getDatabase().journeyModule.delete({
      where: { id: MINISTRY_PRAYER_MODULE_ID },
    });
    expect(await seedProductionJourney(getDatabase())).toBe("attached");
    expect(
      await getDatabase().journeyModule.findUnique({
        where: { id: MINISTRY_PRAYER_MODULE_ID },
        select: { recommendedSeconds: true },
      }),
    ).toEqual({ recommendedSeconds: 2_400 });
  });

  it("preserves running journeys while activating the production seed when safe", async () => {
    const otherJourney = await seedJourney();
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);
    await joinParticipant({
      displayName: "Ana",
      prayerRequest: "",
      sessionTokenHash: "seed-other".padStart(64, "0"),
    });

    expect(await seedProductionJourney(getDatabase())).toBe(
      "preserved-existing",
    );
    expect(
      await getDatabase().gathering.findUnique({
        where: { id: ACTIVE_GATHERING_ID },
        select: { journeyId: true },
      }),
    ).toEqual({ journeyId: otherJourney.id });

    await launchGathering();

    expect(await seedProductionJourney(getDatabase())).toBe(
      "preserved-existing",
    );
    expect(
      await getDatabase().gathering.findUnique({
        where: { id: ACTIVE_GATHERING_ID },
        select: { journeyId: true },
      }),
    ).toEqual({ journeyId: otherJourney.id });

    await clearGathering();
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);
    await joinParticipant({
      displayName: "Ben",
      prayerRequest: "",
      sessionTokenHash: "seed-missing".padStart(64, "0"),
    });
    await launchGathering();

    expect(await seedProductionJourney(getDatabase())).toBe("attached");
    expect(
      await getDatabase().roomJourney.findFirst({
        where: { journeyId: PRODUCTION_JOURNEY_ID },
        select: { currentModuleId: true },
      }),
    ).toEqual({ currentModuleId: null });
  });

  it("makes the first late arrival leader of an empty room", async () => {
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
      displayName: "Late Leader",
      prayerRequest: "",
      sessionTokenHash: "late-leader".padStart(64, "0"),
    });

    const snapshot = await getParticipantSnapshot(
      "late-leader".padStart(64, "0"),
    );
    expect(snapshot.state).toBe("ROOM");
    expect(snapshot.state === "ROOM" && snapshot.room.name).toBe("Upper Room");
    expect(
      snapshot.state === "ROOM" &&
        snapshot.room.members.find(({ id }) => id === snapshot.participant.id)
          ?.isLeader,
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
      data: { leaderId: null },
    });
    await joinParticipant({
      displayName: "Post-rollout Participant",
      prayerRequest: "",
      sessionTokenHash: "post-rollout".padStart(64, "0"),
    });

    await launchGathering();

    expect((await getOrganizerSnapshot()).rooms[0]?.leaderName).toBe(
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
