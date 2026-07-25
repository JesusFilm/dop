import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";

import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __prayerPrismaClient: PrismaClient | undefined;
}

type DatabaseEnvironment = {
  DATABASE_URL?: string;
  PGSSLMODE?: string;
};

export function buildDatabaseConfig(
  environment: DatabaseEnvironment,
): PoolConfig {
  const connectionString = environment.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  return {
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    ssl: environment.PGSSLMODE === "require" ? true : undefined,
    max: 5,
  };
}

/**
 * A human-readable, credential-free description of which database a connection
 * string points at — `host:port/database`.
 *
 * Exists so a destructive job can say out loud which database it acted on. The
 * auto-purge fallback is run by hand from a laptop that has its own `.env`
 * pointing at local Postgres, so "deleted 0 rows" is otherwise indistinguishable
 * from "you just purged the wrong database". Username and password are dropped:
 * this string goes to logs.
 */
export function describeDatabaseTarget(
  connectionString: string | undefined,
): string {
  if (!connectionString) {
    return "unknown (DATABASE_URL unset)";
  }

  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, "");
    return database ? `${url.host}/${database}` : url.host;
  } catch {
    // Never let a logging nicety break the job; the connection attempt itself
    // surfaces a malformed URL.
    return "unknown (unparsable URL)";
  }
}

/**
 * Returns the shared Prisma client, creating it on first use.
 *
 * Next.js can re-evaluate modules during development, so the client lives on
 * globalThis to avoid leaking PostgreSQL pools across hot reloads.
 */
export function getDatabase(): PrismaClient {
  if (!global.__prayerPrismaClient) {
    const adapter = new PrismaPg(
      buildDatabaseConfig({
        DATABASE_URL: process.env.DATABASE_URL,
        PGSSLMODE: process.env.PGSSLMODE,
      }),
    );
    global.__prayerPrismaClient = new PrismaClient({ adapter });
  }

  return global.__prayerPrismaClient;
}

/** Runs the cheapest possible round-trip to confirm the database answers. */
export async function pingDatabase(): Promise<void> {
  await getDatabase().$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  if (!global.__prayerPrismaClient) {
    return;
  }

  await global.__prayerPrismaClient.$disconnect();
  global.__prayerPrismaClient = undefined;
}
