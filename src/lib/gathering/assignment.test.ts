import { describe, expect, it } from "vitest";
import {
  pickNextRoom,
  pickSmallestEligibleRoom,
  validateRoomConfiguration,
} from "@/lib/gathering/assignment";

describe("pickNextRoom", () => {
  it("puts two participants in each room before ordinary round robin", () => {
    const rooms = [
      { id: "first", maxCapacity: null, participantCount: 0 },
      { id: "second", maxCapacity: null, participantCount: 0 },
      { id: "third", maxCapacity: null, participantCount: 0 },
    ];
    const selected: string[] = [];

    for (let index = 0; index < 8; index += 1) {
      const room = pickNextRoom(rooms);
      if (!room) throw new Error("Expected an eligible room");
      selected.push(room.id);
      room.participantCount += 1;
    }

    expect(selected).toEqual([
      "first",
      "first",
      "second",
      "second",
      "third",
      "third",
      "first",
      "second",
    ]);
  });

  it("drops a finite room when it reaches capacity", () => {
    expect(
      pickNextRoom([
        { id: "full", maxCapacity: 2, participantCount: 2 },
        { id: "open-a", maxCapacity: null, participantCount: 4 },
        { id: "open-b", maxCapacity: null, participantCount: 3 },
      ])?.id,
    ).toBe("open-b");
  });

  it("balances 37 participants across six unlimited rooms", () => {
    const rooms = Array.from({ length: 6 }, (_, index) => ({
      id: `room-${index + 1}`,
      maxCapacity: null,
      participantCount: 0,
    }));

    for (let index = 0; index < 37; index += 1) {
      const room = pickNextRoom(rooms);
      if (!room) throw new Error("Expected an eligible room");
      room.participantCount += 1;
    }

    expect(rooms.map(({ participantCount }) => participantCount)).toEqual([
      7, 6, 6, 6, 6, 6,
    ]);
  });

  it("stops assigning to a finite room throughout round robin", () => {
    const rooms = [
      { id: "finite", maxCapacity: 2, participantCount: 0 },
      { id: "open-a", maxCapacity: null, participantCount: 0 },
      { id: "open-b", maxCapacity: null, participantCount: 0 },
    ];

    for (let index = 0; index < 12; index += 1) {
      const room = pickNextRoom(rooms);
      if (!room) throw new Error("Expected an eligible room");
      room.participantCount += 1;
    }

    expect(rooms.map(({ participantCount }) => participantCount)).toEqual([
      2, 5, 5,
    ]);
  });

  it("returns null when every room is full", () => {
    expect(
      pickNextRoom([{ id: "full", maxCapacity: 2, participantCount: 2 }]),
    ).toBeNull();
  });
});

describe("pickSmallestEligibleRoom", () => {
  it("uses configured order only to break a smallest-room tie", () => {
    expect(
      pickSmallestEligibleRoom([
        { id: "earlier-with-one", maxCapacity: null, participantCount: 1 },
        { id: "later-empty", maxCapacity: null, participantCount: 0 },
        { id: "full", maxCapacity: 2, participantCount: 2 },
      ])?.id,
    ).toBe("later-empty");

    expect(
      pickSmallestEligibleRoom([
        { id: "first", maxCapacity: null, participantCount: 1 },
        { id: "second", maxCapacity: null, participantCount: 1 },
      ])?.id,
    ).toBe("first");
  });
});

describe("validateRoomConfiguration", () => {
  it("requires at least one room", () => {
    expect(() => validateRoomConfiguration([])).toThrow(
      "At least one room is required for assignment.",
    );
  });

  it("requires at least one unlimited room", () => {
    expect(() =>
      validateRoomConfiguration([
        { id: "a", maxCapacity: 2 },
        { id: "b", maxCapacity: 4 },
      ]),
    ).toThrow("unlimited");
  });

  it("rejects finite capacities below two", () => {
    expect(() =>
      validateRoomConfiguration([
        { id: "open", maxCapacity: null },
        { id: "single", maxCapacity: 1 },
      ]),
    ).toThrow("at least two");
  });

  it("accepts seeded rooms with an unlimited room", () => {
    expect(() =>
      validateRoomConfiguration([
        { id: "open", maxCapacity: null },
        { id: "small", maxCapacity: 2 },
      ]),
    ).not.toThrow();
  });
});
