import { describe, expect, it } from "vitest";
import {
  assignParticipantsToRooms,
  chooseCoordinator,
} from "@/lib/gathering/assignment";

const stableRandom = () => 0.25;

describe("assignParticipantsToRooms", () => {
  it("balances 37 participants across six unlimited rooms", () => {
    const result = assignParticipantsToRooms(
      Array.from({ length: 37 }, (_, index) => `p-${index}`),
      Array.from({ length: 6 }, (_, index) => ({
        id: `room-${index}`,
        maxCapacity: null,
      })),
      stableRandom,
    );

    expect(
      [...result.values()].map((members) => members.length).sort(),
    ).toEqual([6, 6, 6, 6, 6, 7]);
  });

  it("respects caps while balancing eligible rooms", () => {
    const result = assignParticipantsToRooms(
      Array.from({ length: 12 }, (_, index) => `p-${index}`),
      [
        { id: "small", maxCapacity: 2 },
        { id: "open-a", maxCapacity: null },
        { id: "open-b", maxCapacity: null },
      ],
      stableRandom,
    );

    expect(result.get("small")).toHaveLength(2);
    expect(result.get("open-a")).toHaveLength(5);
    expect(result.get("open-b")).toHaveLength(5);
  });

  it("rejects insufficient capacity without partial assignments", () => {
    expect(() =>
      assignParticipantsToRooms(
        ["p-1", "p-2", "p-3"],
        [
          { id: "a", maxCapacity: 1 },
          { id: "b", maxCapacity: 1 },
        ],
        stableRandom,
      ),
    ).toThrow("capacity");
  });

  it("rejects assignment when no rooms exist", () => {
    expect(() => assignParticipantsToRooms(["p-1"], [], stableRandom)).toThrow(
      "room",
    );
  });

  it("requires a room even when nobody has joined yet", () => {
    expect(() => assignParticipantsToRooms([], [], stableRandom)).toThrow(
      "room",
    );
  });
});

describe("chooseCoordinator", () => {
  it("chooses one member from the room", () => {
    expect(chooseCoordinator(["a", "b", "c"], stableRandom)).toBe("a");
  });

  it("returns null for an empty room", () => {
    expect(chooseCoordinator([], stableRandom)).toBeNull();
  });
});
