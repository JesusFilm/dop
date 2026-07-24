import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@/lib/health";

const fixedNow = () => new Date("2026-07-27T00:00:00.000Z");

describe("buildHealthReport", () => {
  it("reports ok when the database ping succeeds", async () => {
    const report = await buildHealthReport(async () => {}, fixedNow);
    expect(report).toEqual({
      status: "ok",
      database: "ok",
      time: "2026-07-27T00:00:00.000Z",
    });
  });

  it("reports degraded when the database ping rejects", async () => {
    const report = await buildHealthReport(async () => {
      throw new Error("connection refused");
    }, fixedNow);
    expect(report).toEqual({
      status: "degraded",
      database: "error",
      time: "2026-07-27T00:00:00.000Z",
    });
  });

  it("does not leak the underlying error to the caller", async () => {
    await expect(
      buildHealthReport(async () => {
        throw new Error("secret connection string leaked");
      }, fixedNow),
    ).resolves.toMatchObject({ database: "error" });
  });
});
