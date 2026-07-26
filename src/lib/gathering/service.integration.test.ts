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
  KNOWING_GOD_MODULE_ID,
  MINISTRY_PRAYER_MODULE_ID,
  PERSONAL_PRAYER_MODULE_ID,
  PRODUCTION_JOURNEY_ID,
  SHORT_STUDY_MODULE_ID,
  seedProductionJourney,
} from "@/lib/journey/seed";
import { JULY_MINISTRY_PRAYER_CONFIGURATION } from "@/lib/journey/ministry-prayer-seed";

const EXPECTED_KNOWING_GOD_CONFIGURATION = {
  passageReference: "Ephesians 1:15–23",
  scriptureText:
    "15 For this reason, ever since I heard about your faith in the Lord Jesus and your love for all the saints,\n\n16 I have not stopped giving thanks for you, remembering you in my prayers,\n\n17 that the God of our Lord Jesus Christ, the glorious Father, may give you a spirit of wisdom and revelation in your knowledge of Him.\n\n18 I ask that the eyes of your heart may be enlightened, so that you may know the hope of His calling, the riches of His glorious inheritance in the saints,\n\n19 and the surpassing greatness of His power to us who believe. These are in accordance with the working of His mighty strength,\n\n20 which He exerted in Christ when He raised Him from the dead and seated Him at His right hand in the heavenly realms,\n\n21 far above all rule and authority, power and dominion, and every name that is named, not only in the present age but also in the one to come.\n\n22 And God put everything under His feet and made Him head over everything for the church,\n\n23 which is His body, the fullness of Him who fills all in all.",
  translation: "Berean Standard Bible (BSB)",
  reflections: [
    "Knowing Christ: Paul prays that God would give us wisdom and revelation so that we may know Him—not merely know facts about Him, but know Christ personally and be transformed by Him.",
    "Enlightened hearts: When God enlightens the eyes of our hearts, we begin to grasp the hope of His calling, the riches of His inheritance, and the surpassing greatness of His power toward those who believe.",
    "Confident hope: Christian hope is confident expectation that God will fulfill every promise in Christ. We will receive our inheritance, be united with the Lord, and one day be free from sin, pain, sickness, and struggle.",
  ],
  discussionQuestion: "What would it look like for us to pray like Paul today?",
};

const EXPECTED_WHY_WE_PRAY_CONFIGURATION = {
  passageReference: "Hebrews 4:14–16",
  scriptureText:
    "14 Therefore, since we have a great high priest who has passed through the heavens, Jesus the Son of God, let us hold firmly to what we profess.\n\n15 For we do not have a high priest who is unable to sympathize with our weaknesses, but One who was tempted in every way that we are, yet was without sin.\n\n16 Let us then approach the throne of grace with confidence, so that we may receive mercy and find grace to help us in our time of need.",
  translation: "Berean Standard Bible (BSB)",
  reflections: [
    "Jesus understands our weakness. Prayer does not require us to pretend that we are stronger or more spiritual than we are.",
    "Jesus gives us confident access to God. We approach because of Christ, not because of how well we pray.",
    "God offers mercy, grace, and timely help. We can bring our real needs to a God who welcomes and helps us.",
  ],
  discussionQuestion:
    "How should knowing that God welcomes us with mercy and grace shape the way we pray today?",
};

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

  it("rejects a blank personal prayer request before assigning a room", async () => {
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);

    await expect(
      joinParticipant({
        displayName: "Ana",
        prayerRequest: "   ",
        sessionTokenHash: "required-request".padStart(64, "0"),
      }),
    ).rejects.toMatchObject({
      code: "PRAYER_REQUEST_REQUIRED",
      message: "Enter a personal prayer request to join.",
    });

    expect(await getDatabase().participant.count()).toBe(0);
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
      prayerRequest: "Please pray for me.",
      sessionTokenHash: "first-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Second leader",
      prayerRequest: "Please pray for me.",
      sessionTokenHash: "second-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Third leader",
      prayerRequest: "Please pray for me.",
      sessionTokenHash: "third-journey".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Fourth participant",
      prayerRequest: "Please pray for me.",
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
      prayerRequest: "Please pray for me.",
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
      await getDatabase().journeyModule.findMany({
        where: { journeyId: PRODUCTION_JOURNEY_ID },
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          behaviorKey: true,
          title: true,
          recommendedSeconds: true,
          configuration: true,
        },
      }),
    ).toEqual([
      {
        id: KNOWING_GOD_MODULE_ID,
        position: 0,
        behaviorKey: "short-study",
        title: "Knowing God",
        recommendedSeconds: 600,
        configuration: EXPECTED_KNOWING_GOD_CONFIGURATION,
      },
      {
        id: SHORT_STUDY_MODULE_ID,
        position: 1,
        behaviorKey: "short-study",
        title: "Why we pray",
        recommendedSeconds: 600,
        configuration: EXPECTED_WHY_WE_PRAY_CONFIGURATION,
      },
      {
        id: MINISTRY_PRAYER_MODULE_ID,
        position: 2,
        behaviorKey: "ministry-prayer",
        title: "Pray for our ministries",
        recommendedSeconds: 2_400,
        configuration: JULY_MINISTRY_PRAYER_CONFIGURATION,
      },
      {
        id: PERSONAL_PRAYER_MODULE_ID,
        position: 3,
        behaviorKey: "personal-prayer",
        title: "Personal prayer",
        recommendedSeconds: 600,
        configuration: {},
      },
    ]);

    for (const [name, token] of [
      ["Ana", "short-ana"],
      ["Ben", "short-ben"],
      ["Chi", "short-chi"],
    ] as const) {
      await joinParticipant({
        displayName: name,
        prayerRequest: "Please pray for me.",
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
        expectedState: `${KNOWING_GOD_MODULE_ID}:0`,
        module: {
          id: KNOWING_GOD_MODULE_ID,
          title: "Knowing God",
          recommendedSeconds: 600,
          behaviorKey: "short-study",
          shortStudy: {
            contribution: {
              kind: "passage",
              label: "Ephesians 1:15–23",
            },
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
      journey: { expectedState: `${KNOWING_GOD_MODULE_ID}:0` },
    });

    let current: Awaited<ReturnType<typeof getParticipantSnapshot>> =
      afterStudyTakeover;
    for (let index = 1; index <= 4; index += 1) {
      await advanceRoomJourney({
        sessionTokenHash: leaderToken,
        expectedState:
          current.state === "ROOM" && current.journey?.state === "ACTIVE"
            ? current.journey.expectedState
            : "",
        expectedRevision: current.revision,
      });
      current = await getParticipantSnapshot(leaderToken);
      expect(current).toMatchObject({
        journey: { expectedState: `${KNOWING_GOD_MODULE_ID}:${index}` },
      });
    }

    const overwrittenModuleStartedAt = "2026-01-01T00:00:00.000Z";
    await getDatabase().roomJourney.updateMany({
      where: { journeyId: PRODUCTION_JOURNEY_ID },
      data: { moduleStartedAt: new Date(overwrittenModuleStartedAt) },
    });
    await advanceRoomJourney({
      sessionTokenHash: leaderToken,
      expectedState:
        current.state === "ROOM" && current.journey?.state === "ACTIVE"
          ? current.journey.expectedState
          : "",
      expectedRevision: current.revision,
    });
    current = await getParticipantSnapshot(leaderToken);
    expect(current).toMatchObject({
      journey: {
        expectedState: `${SHORT_STUDY_MODULE_ID}:0`,
        module: {
          id: SHORT_STUDY_MODULE_ID,
          title: "Why we pray",
          recommendedSeconds: 600,
          shortStudy: { contribution: { kind: "passage" } },
        },
      },
    });
    expect(
      current.state === "ROOM" && current.journey?.state === "ACTIVE"
        ? current.journey.module.startedAt
        : "",
    ).not.toBe(overwrittenModuleStartedAt);

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
    expect(current).toMatchObject({
      journey: {
        state: "ACTIVE",
        expectedState: `${PERSONAL_PRAYER_MODULE_ID}:grouping`,
        module: {
          behaviorKey: "personal-prayer",
          personalPrayer: {
            phase: "grouping",
            members: expect.arrayContaining([
              expect.objectContaining({ name: "Ana" }),
              expect.objectContaining({ name: "Ben" }),
              expect.objectContaining({ name: "Chi" }),
            ]),
          },
        },
      },
    });
    expect(JSON.stringify(current)).not.toContain("Please pray for me.");

    await advanceRoomJourney({
      sessionTokenHash: leaderToken,
      expectedState:
        current.state === "ROOM" && current.journey?.state === "ACTIVE"
          ? current.journey.expectedState
          : "",
      expectedRevision: current.revision,
    });
    current = await getParticipantSnapshot(leaderToken);
    expect(current).toMatchObject({
      journey: {
        expectedState: `${PERSONAL_PRAYER_MODULE_ID}:revealed`,
        module: {
          behaviorKey: "personal-prayer",
          personalPrayer: {
            phase: "revealed",
            members: expect.arrayContaining([
              expect.objectContaining({
                name: "Ana",
                request: "Please pray for me.",
              }),
              expect.objectContaining({
                name: "Ben",
                request: "Please pray for me.",
              }),
              expect.objectContaining({
                name: "Chi",
                request: "Please pray for me.",
              }),
            ]),
          },
        },
      },
    });

    await advanceRoomJourney({
      sessionTokenHash: leaderToken,
      expectedState:
        current.state === "ROOM" && current.journey?.state === "ACTIVE"
          ? current.journey.expectedState
          : "",
      expectedRevision: current.revision,
    });
    expect(await getParticipantSnapshot(leaderToken)).toMatchObject({
      journey: { state: "COMPLETED" },
    });
  });

  it("reveals requests only inside persisted prayer groups and appends late arrivals", async () => {
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);
    await seedProductionJourney(getDatabase());
    const tokens = Array.from({ length: 5 }, (_, index) =>
      `prayer-${index + 1}`.padStart(64, "0"),
    );
    for (const [index, token] of tokens.entries()) {
      await joinParticipant({
        displayName: `Participant ${index + 1}`,
        prayerRequest: `Private request ${index + 1}`,
        sessionTokenHash: token,
      });
    }
    await launchGathering();

    const room = await getDatabase().room.findFirstOrThrow({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      select: {
        id: true,
        journeyRuntime: { select: { id: true } },
        participants: {
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: { id: true },
        },
      },
    });
    const participantIds = room.participants.map(({ id }) => id);
    await getDatabase().participant.update({
      where: { id: participantIds[1] },
      data: {
        prayerCiphertext: null,
        prayerIv: null,
        prayerAuthTag: null,
      },
    });
    await getDatabase().roomJourney.update({
      where: { id: room.journeyRuntime!.id },
      data: {
        currentModuleId: PERSONAL_PRAYER_MODULE_ID,
        moduleStartedAt: new Date(),
        moduleState: {
          phase: "grouping",
          groups: [participantIds.slice(0, 3), participantIds.slice(3)],
        },
      },
    });

    let leader = await getParticipantSnapshot(tokens[0]);
    expect(leader).toMatchObject({
      journey: {
        expectedState: `${PERSONAL_PRAYER_MODULE_ID}:grouping`,
        module: {
          personalPrayer: {
            phase: "grouping",
            members: [
              { name: "Participant 1" },
              { name: "Participant 2" },
              { name: "Participant 3" },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(leader)).not.toContain("Private request");

    await takeOverLeader({
      sessionTokenHash: tokens[1],
      expectedRevision: leader.revision,
    });
    leader = await getParticipantSnapshot(tokens[1]);
    expect(leader).toMatchObject({
      journey: {
        expectedState: `${PERSONAL_PRAYER_MODULE_ID}:grouping`,
        module: { personalPrayer: { phase: "grouping" } },
      },
    });

    await advanceRoomJourney({
      sessionTokenHash: tokens[1],
      expectedState:
        leader.state === "ROOM" && leader.journey?.state === "ACTIVE"
          ? leader.journey.expectedState
          : "",
      expectedRevision: leader.revision,
    });
    leader = await getParticipantSnapshot(tokens[0]);
    expect(leader).toMatchObject({
      journey: {
        expectedState: `${PERSONAL_PRAYER_MODULE_ID}:revealed`,
        module: {
          personalPrayer: {
            members: [
              { name: "Participant 1", request: "Private request 1" },
              { name: "Participant 2", request: null },
              { name: "Participant 3", request: "Private request 3" },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(leader)).not.toContain("Private request 4");
    expect(JSON.stringify(leader)).not.toContain("Private request 5");
    expect(JSON.stringify(await getOrganizerSnapshot())).not.toContain(
      "Private request",
    );

    const lateToken = "prayer-late".padStart(64, "0");
    await joinParticipant({
      displayName: "Late Participant",
      prayerRequest: "Late private request",
      sessionTokenHash: lateToken,
    });
    const late = await getParticipantSnapshot(lateToken);
    expect(late).toMatchObject({
      journey: {
        expectedState: `${PERSONAL_PRAYER_MODULE_ID}:revealed`,
        module: {
          personalPrayer: {
            members: [
              { name: "Participant 4", request: "Private request 4" },
              { name: "Participant 5", request: "Private request 5" },
              { name: "Late Participant", request: "Late private request" },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(late)).not.toContain("Private request 1");

    const activeLeader = await getParticipantSnapshot(tokens[1]);
    await advanceRoomJourney({
      sessionTokenHash: tokens[1],
      expectedState:
        activeLeader.state === "ROOM" &&
        activeLeader.journey?.state === "ACTIVE"
          ? activeLeader.journey.expectedState
          : "",
      expectedRevision: activeLeader.revision,
    });
    const completed = await getParticipantSnapshot(tokens[1]);
    expect(completed).toMatchObject({ journey: { state: "COMPLETED" } });
    expect(JSON.stringify(completed)).not.toContain("Private request");
  });

  it("preserves running journeys while activating the production seed when safe", async () => {
    const otherJourney = await seedJourney();
    await seedRooms([{ name: "Olive Grove", maxCapacity: null }]);
    await joinParticipant({
      displayName: "Ana",
      prayerRequest: "Please pray for me.",
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
      prayerRequest: "Please pray for me.",
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
      prayerRequest: "Please pray for me.",
      sessionTokenHash: "initial".padStart(64, "0"),
    });
    await launchGathering();
    await joinParticipant({
      displayName: "Late Leader",
      prayerRequest: "Please pray for me.",
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
      prayerRequest: "Please pray for me.",
      sessionTokenHash: "first".padStart(64, "0"),
    });
    await joinParticipant({
      displayName: "Second Participant",
      prayerRequest: "Please pray for me.",
      sessionTokenHash: "second".padStart(64, "0"),
    });
    await getDatabase().room.updateMany({
      where: { gatheringId: ACTIVE_GATHERING_ID },
      data: { leaderId: null },
    });
    await joinParticipant({
      displayName: "Post-rollout Participant",
      prayerRequest: "Please pray for me.",
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
          prayerRequest: "Please pray for me.",
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
        prayerRequest: "Please pray for me.",
        sessionTokenHash: "waiting".padStart(64, "0"),
      }),
    ).rejects.toMatchObject({ code: "ROOM_CONFIGURATION_INVALID" });
    expect(await getOrganizerSnapshot()).toMatchObject({
      phase: "FORMING",
      participantCount: 0,
    });
  });
});
