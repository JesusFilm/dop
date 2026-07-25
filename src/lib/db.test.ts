import { describe, expect, it } from "vitest";

import { buildDatabaseConfig, describeDatabaseTarget } from "@/lib/db";

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

describe("describeDatabaseTarget", () => {
  it("names the host and database so an operator can see which database was hit", () => {
    expect(
      describeDatabaseTarget(
        "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
      ),
    ).toBe("postgres.railway.internal:5432/railway");
  });

  it("never leaks the password or user", () => {
    const described = describeDatabaseTarget(
      "postgresql://admin:sup3r-s3cret@db.example.com/dop",
    );

    expect(described).not.toContain("sup3r-s3cret");
    expect(described).not.toContain("admin");
    expect(described).toBe("db.example.com/dop");
  });

  it("distinguishes a local database from a remote one", () => {
    expect(
      describeDatabaseTarget(
        "postgres://postgres:postgres@localhost:5432/secret_prayer",
      ),
    ).toBe("localhost:5432/secret_prayer");
  });

  it("reports an unset variable rather than throwing", () => {
    expect(describeDatabaseTarget(undefined)).toBe(
      "unknown (DATABASE_URL unset)",
    );
  });

  it("reports an unparsable value rather than throwing", () => {
    expect(describeDatabaseTarget("not-a-url")).toBe(
      "unknown (unparsable URL)",
    );
  });
});
