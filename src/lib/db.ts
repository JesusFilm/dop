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
