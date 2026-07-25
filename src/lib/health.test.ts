import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@/lib/health";

const fixedNow = () => new Date("2026-07-27T00:00:00.000Z");

describe("buildHealthReport", () => {
  it("reports ok when the database ping succeeds", async () => {
    const report = await buildHealthReport(
      {
        pingDatabase: async () => {},
        validateConfiguration: () => {},
      },
      fixedNow,
    );
    expect(report).toEqual({
      status: "ok",
      database: "ok",
      configuration: "ok",
      time: "2026-07-27T00:00:00.000Z",
    });
  });

  it("reports degraded when the database ping rejects", async () => {
    const report = await buildHealthReport(
      {
        pingDatabase: async () => {
          throw new Error("connection refused");
        },
        validateConfiguration: () => {},
      },
      fixedNow,
    );
    expect(report).toEqual({
      status: "degraded",
      database: "error",
      configuration: "ok",
      time: "2026-07-27T00:00:00.000Z",
    });
  });

  it("does not leak the underlying error to the caller", async () => {
    await expect(
      buildHealthReport(
        {
          pingDatabase: async () => {
            throw new Error("secret connection string leaked");
          },
          validateConfiguration: () => {},
        },
        fixedNow,
      ),
    ).resolves.toMatchObject({ database: "error" });
  });

  it("reports degraded when encryption configuration is invalid", async () => {
    await expect(
      buildHealthReport(
        {
          pingDatabase: async () => {},
          validateConfiguration: () => {
            throw new Error("invalid encryption key");
          },
        },
        fixedNow,
      ),
    ).resolves.toMatchObject({
      status: "degraded",
      database: "ok",
      configuration: "error",
    });
  });
});
