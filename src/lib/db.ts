import { Pool } from "pg";

// A single shared connection pool for the process. Next.js can re-evaluate
// modules across hot reloads in dev, so we stash the pool on globalThis to
// avoid leaking pools during development.
declare global {
  // eslint-disable-next-line no-var
  var __prayerPgPool: Pool | undefined;
}

/**
 * Returns the shared Postgres pool, creating it on first use.
 *
 * Reads `DATABASE_URL` (Railway provides this automatically when a Postgres
 * plugin is attached to the service). Throws if it is missing so a
 * misconfigured deploy fails loudly at the health check rather than silently.
 */
export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!global.__prayerPgPool) {
    global.__prayerPgPool = new Pool({
      connectionString,
      // Railway's private network (…​.railway.internal) does not use TLS, so
      // TLS stays off by default. Set PGSSLMODE=require for public/external
      // connections — `ssl: true` enables TLS *with* certificate verification
      // (never rejectUnauthorized:false, which would encrypt without
      // authenticating and leave the connection open to MITM).
      ssl: process.env.PGSSLMODE === "require" ? true : undefined,
      // Keep the pool small — this app is single-session and low-traffic.
      max: 5,
    });
  }

  return global.__prayerPgPool;
}

/** Runs the cheapest possible round-trip to confirm the database answers. */
export async function pingDatabase(): Promise<void> {
  const pool = getPool();
  await pool.query("SELECT 1");
}
