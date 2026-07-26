import { describe, expect, it } from "vitest";
import {
  getJourneyModule,
  validateJourneyModule,
} from "@/lib/journey/registry";

describe("journey module registry", () => {
  it("rejects unknown module behavior", () => {
    expect(() => validateJourneyModule("unknown", {})).toThrow(
      "Unknown journey module",
    );
  });

  it("keeps the browser fixture disabled by default", () => {
    expect(getJourneyModule("test-guided-prayer")).toBeUndefined();
  });

  it("returns only the validated client-safe payload", () => {
    process.env.JOURNEY_TEST_MODULES = "enabled";
    expect(
      validateJourneyModule("test-guided-prayer", {
        prompt: "Pray together.",
        serverOnlySecret: "never expose this",
      }),
    ).toEqual({
      behaviorKey: "test-guided-prayer",
      configuration: { prompt: "Pray together." },
    });
    delete process.env.JOURNEY_TEST_MODULES;
  });
});
