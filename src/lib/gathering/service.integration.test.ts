import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/lib/db";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";
import {
  addRoom,
  getOrganizerSnapshot,
  getParticipantSnapshot,
  joinParticipant,
  launchGathering,
  removeRoom,
  resetGathering,
  takeOverCoordinator,
  updateRoom,
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

describe("gathering lifecycle", () => {
  beforeEach(clearGathering);
  afterAll(async () => {
    await clearGathering();
    await disconnectDatabase();
  });

  it("joins, launches, takes over, accepts a late arrival, and resets", async () => {
    await addRoom({
      name: "Olive Grove",
      directions: "Level 2",
      maxCapacity: null,
    });
    await addRoom({
      name: "Upper Room",
      directions: "Beside reception",
      maxCapacity: 3,
    });

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        joinParticipant({
          displayName: `Participant ${index + 1}`,
          prayerRequest: `Private request ${index + 1}`,
          sessionTokenHash: String(index + 1).padStart(64, "0"),
        }),
      ),
    );

    const beforeLaunch = await getOrganizerSnapshot();
    expect(beforeLaunch).toMatchObject({
      phase: "FORMING",
      participantCount: 5,
      capacitySufficient: true,
    });
    expect(JSON.stringify(beforeLaunch)).not.toContain("Private request");

    await launchGathering();
    const assigned = await getOrganizerSnapshot();
    expect(assigned.phase).toBe("ASSIGNED");
    expect(assigned.rooms.map(({ memberCount }) => memberCount).sort()).toEqual(
      [2, 3],
    );
    expect(
      assigned.rooms.every(
        (room) => room.memberCount === 0 || room.coordinatorName !== null,
      ),
    ).toBe(true);

    const first = await getParticipantSnapshot("1".padStart(64, "0"));
    expect(first.state).toBe("ROOM");
    if (first.state !== "ROOM") throw new Error("Expected a room snapshot");
    await takeOverCoordinator("1".padStart(64, "0"));
    const afterTakeover = await getParticipantSnapshot("1".padStart(64, "0"));
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

    await resetGathering();
    expect(await getParticipantSnapshot("1".padStart(64, "0"))).toMatchObject({
      state: "JOIN",
    });
    const reset = await getOrganizerSnapshot();
    expect(reset).toMatchObject({ phase: "FORMING", participantCount: 0 });
    expect(reset.rooms).toHaveLength(2);
  });

  it("makes the first late arrival coordinator of an empty room", async () => {
    await addRoom({
      name: "Olive Grove",
      directions: "Level 2",
      maxCapacity: null,
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
    expect(
      snapshot.state === "ROOM" &&
        snapshot.room.members.find(({ id }) => id === snapshot.participant.id)
          ?.isCoordinator,
    ).toBe(true);
  });

  it("keeps launch atomic and locks room configuration", async () => {
    await addRoom({
      name: "Unlimited Room",
      directions: "",
      maxCapacity: null,
    });
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
    expect(launched.rooms[0]?.memberCount).toBe(12);
    await expect(
      updateRoom({
        id: launched.rooms[0]?.id ?? "",
        name: "Renamed",
        directions: "",
        maxCapacity: null,
      }),
    ).rejects.toMatchObject({ code: "ROOMS_LOCKED" });
  });

  it("blocks launch with no rooms without partially assigning participants", async () => {
    await joinParticipant({
      displayName: "Waiting Participant",
      prayerRequest: "",
      sessionTokenHash: "waiting".padStart(64, "0"),
    });

    await expect(launchGathering()).rejects.toMatchObject({
      code: "LAUNCH_BLOCKED",
    });
    expect(
      await getParticipantSnapshot("waiting".padStart(64, "0")),
    ).toMatchObject({ state: "LOBBY" });
    expect(await getOrganizerSnapshot()).toMatchObject({ phase: "FORMING" });
  });

  it("preserves an unlimited room while allowing other rooms to be removed", async () => {
    await addRoom({
      name: "Unlimited Room",
      directions: "",
      maxCapacity: null,
    });
    await addRoom({
      name: "Capped Room",
      directions: "",
      maxCapacity: 4,
    });

    const snapshot = await getOrganizerSnapshot();
    const unlimited = snapshot.rooms.find(
      ({ maxCapacity }) => maxCapacity === null,
    );
    const capped = snapshot.rooms.find(({ maxCapacity }) => maxCapacity === 4);
    await expect(removeRoom(unlimited?.id ?? "")).rejects.toMatchObject({
      code: "UNLIMITED_ROOM_REQUIRED",
    });
    await removeRoom(capped?.id ?? "");

    expect((await getOrganizerSnapshot()).rooms).toMatchObject([
      { name: "Unlimited Room", maxCapacity: null },
    ]);
  });
});
