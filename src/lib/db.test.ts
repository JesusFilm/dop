import { describe, expect, it } from "vitest";

import { buildDatabaseConfig } from "@/lib/db";

describe("buildDatabaseConfig", () => {
  it("requires DATABASE_URL", () => {
    expect(() => buildDatabaseConfig({})).toThrow("DATABASE_URL is not set");
  });

  it("uses a small non-TLS pool on Railway private networking", () => {
    expect(
      buildDatabaseConfig({
        DATABASE_URL:
          "postgresql://postgres:secret@postgres.railway.internal/dop",
      }),
    ).toEqual({
      connectionTimeoutMillis: 5_000,
      connectionString:
        "postgresql://postgres:secret@postgres.railway.internal/dop",
      max: 5,
      query_timeout: 5_000,
      ssl: undefined,
    });
  });

  it("enables verified TLS when PGSSLMODE requires it", () => {
    expect(
      buildDatabaseConfig({
        DATABASE_URL: "postgresql://postgres:secret@example.com/dop",
        PGSSLMODE: "require",
      }),
    ).toEqual({
      connectionTimeoutMillis: 5_000,
      connectionString: "postgresql://postgres:secret@example.com/dop",
      max: 5,
      query_timeout: 5_000,
      ssl: true,
    });
  });
});
