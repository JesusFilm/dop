export interface HealthReport {
  status: "ok" | "degraded";
  database: "ok" | "error";
  /** ISO-8601 timestamp from the app's own clock. */
  time: string;
}

/**
 * Builds the health report by attempting a database round-trip.
 *
 * The database check is injected so this stays a pure, unit-testable function:
 * callers pass `pingDatabase` in production and a stub in tests. When the ping
 * rejects, the report is `degraded`/`error` rather than throwing — the route
 * decides the HTTP status from the report.
 */
export async function buildHealthReport(
  ping: () => Promise<void>,
  now: () => Date = () => new Date(),
): Promise<HealthReport> {
  const time = now().toISOString();
  try {
    await ping();
    return { status: "ok", database: "ok", time };
  } catch {
    return { status: "degraded", database: "error", time };
  }
}
