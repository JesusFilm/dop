import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { INITIAL_ROOMS, seedInitialRooms } from "@/lib/gathering/seed-rooms";

describe("seedInitialRooms", () => {
  it("defines the known room configuration", () => {
    expect(
      INITIAL_ROOMS.map(({ name, directions, maxCapacity }) => ({
        name,
        directions,
        maxCapacity,
      })),
    ).toEqual([
      { name: "Auditorium", directions: "Downstairs", maxCapacity: null },
      { name: "Boardroom 2", directions: "Downstairs", maxCapacity: 8 },
      { name: "Journey Room", directions: "Downstairs", maxCapacity: 8 },
      { name: "Boardroom", directions: "Upstairs", maxCapacity: 8 },
      { name: "Breakout space", directions: "", maxCapacity: null },
      { name: "Meeting room", directions: "Upstairs", maxCapacity: 4 },
      { name: "Quiet room", directions: "Upstairs", maxCapacity: 4 },
      {
        name: "Creative Meeting Room",
        directions: "Downstairs",
        maxCapacity: 8,
      },
    ]);
  });

  it("creates only missing rooms without overwriting existing configuration", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ id: "active", phase: "FORMING" });
    const findMany = vi.fn().mockResolvedValue([{ name: "Auditorium" }]);
    const createMany = vi.fn().mockResolvedValue({ count: 7 });
    const transaction = {
      gathering: { upsert },
      room: { createMany, findMany },
    };
    const database = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(seedInitialRooms(database)).resolves.toBe(7);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "active" },
      create: { id: "active" },
      update: {},
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { gatheringId: "active" },
      select: { name: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: INITIAL_ROOMS.filter(({ name }) => name !== "Auditorium").map(
        (room) => ({
          ...room,
          gatheringId: "active",
        }),
      ),
      skipDuplicates: true,
    });
  });

  it("does not change room configuration after launch", async () => {
    const createMany = vi.fn();
    const transaction = {
      gathering: {
        upsert: vi.fn().mockResolvedValue({ id: "active", phase: "ASSIGNED" }),
      },
      room: { createMany },
    };
    const database = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(seedInitialRooms(database)).rejects.toThrow(
      "Cannot seed rooms after the gathering has launched.",
    );
    expect(createMany).not.toHaveBeenCalled();
  });
});
