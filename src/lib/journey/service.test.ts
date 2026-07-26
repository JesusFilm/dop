import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getValidJourney } from "@/lib/journey/service";

function databaseWithModules(
  modules: {
    id?: string;
    position: number;
    recommendedSeconds: number;
    behaviorKey?: string;
    configuration?: unknown;
  }[],
) {
  return {
    journey: {
      findUnique: vi.fn().mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000001",
        name: "Test journey",
        modules: modules.map((module, index) => ({
          id: module.id ?? `00000000-0000-0000-0000-00000000000${index + 2}`,
          position: module.position,
          recommendedSeconds: module.recommendedSeconds,
          behaviorKey: module.behaviorKey ?? "test-guided-prayer",
          configuration: module.configuration ?? { prompt: "Pray." },
        })),
      }),
    },
  } as unknown as PrismaClient;
}

describe("journey validation", () => {
  afterEach(() => {
    delete process.env.JOURNEY_TEST_MODULES;
  });

  it.each([
    { minutes: 60, available: true },
    { minutes: 90, available: true },
    { minutes: 59, available: false },
    { minutes: 91, available: false },
  ])(
    "treats a $minutes-minute journey availability as $available",
    async ({ minutes, available }) => {
      process.env.JOURNEY_TEST_MODULES = "enabled";
      const journey = await getValidJourney(
        databaseWithModules([
          {
            position: 0,
            recommendedSeconds: minutes * 60,
          },
        ]),
        "00000000-0000-0000-0000-000000000001",
      );

      expect(journey !== null).toBe(available);
    },
  );

  it.each([
    {
      name: "empty",
      modules: [],
    },
    {
      name: "position gap",
      modules: [{ position: 1, recommendedSeconds: 3_600 }],
    },
    {
      name: "unknown behavior",
      modules: [
        {
          position: 0,
          recommendedSeconds: 3_600,
          behaviorKey: "unknown",
        },
      ],
    },
    {
      name: "invalid configuration",
      modules: [
        {
          position: 0,
          recommendedSeconds: 3_600,
          configuration: {},
        },
      ],
    },
  ])("rejects $name journey configuration", async ({ modules }) => {
    process.env.JOURNEY_TEST_MODULES = "enabled";
    await expect(
      getValidJourney(
        databaseWithModules(modules),
        "00000000-0000-0000-0000-000000000001",
      ),
    ).resolves.toBeNull();
  });
});
