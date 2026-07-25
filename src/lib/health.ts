export interface HealthReport {
  status: "ok" | "degraded";
  database: "ok" | "error";
  configuration: "ok" | "error";
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
  checks: {
    pingDatabase: () => Promise<void>;
    validateConfiguration: () => void;
  },
  now: () => Date = () => new Date(),
): Promise<HealthReport> {
  const time = now().toISOString();
  const [database, configuration] = await Promise.allSettled([
    checks.pingDatabase(),
    Promise.resolve().then(checks.validateConfiguration),
  ]);
  const databaseStatus = database.status === "fulfilled" ? "ok" : "error";
  const configurationStatus =
    configuration.status === "fulfilled" ? "ok" : "error";

  return {
    status:
      databaseStatus === "ok" && configurationStatus === "ok"
        ? "ok"
        : "degraded",
    database: databaseStatus,
    configuration: configurationStatus,
    time,
  };
}
