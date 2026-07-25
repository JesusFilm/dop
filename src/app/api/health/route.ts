import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";
import { buildHealthReport } from "@/lib/health";
import { validatePrayerRequestEncryptionKey } from "@/lib/gathering/prayer-request-crypto";

// Always run this route dynamically — a cached health check is worthless.
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Confirms the full loop: the app is serving, its Postgres is reachable, and
 * required runtime configuration is valid. Returns 503 when any dependency is
 * unavailable so Railway (and uptime checks) see the difference.
 */
export async function GET() {
  // Log the underlying failure before it is swallowed into a "degraded" report.
  // Without this, a failed Railway healthcheck gives no clue whether the cause
  // is an unset/misresolved DATABASE_URL, a TLS mismatch, or a refused
  // connection — the deploy just cycles on opaque 503s.
  const report = await buildHealthReport({
    pingDatabase: async () => {
      try {
        await pingDatabase();
      } catch (error) {
        console.error("[health] database ping failed:", error);
        throw error;
      }
    },
    validateConfiguration: () => {
      try {
        validatePrayerRequestEncryptionKey();
      } catch (error) {
        console.error(
          "[health] prayer-request encryption configuration failed:",
          error,
        );
        throw error;
      }
    },
  });
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
  });
}
