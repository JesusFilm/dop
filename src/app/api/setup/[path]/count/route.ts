import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db";
import { countSubmissions, findSessionBySetupPath } from "@/lib/repository";
import { isConfiguredSetupPath } from "@/lib/setup";

// The live count must never be cached — it is the organizer's only dashboard.
export const dynamic = "force-dynamic";

/**
 * GET /api/setup/[path]/count
 *
 * The live submission count for the setup-page dashboard (§7.5, #8). Returns a
 * bare number only — never request content (Privacy #3) — via the sanctioned
 * `countSubmissions`. Reads 0 after the next-morning purge, doubling as the
 * purge-verification view. 404s for an unknown path or before the session
 * exists, so the count is only ever exposed at the unguessable setup path.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string }> },
) {
  const { path } = await params;

  if (!isConfiguredSetupPath(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDatabase();
  const session = await findSessionBySetupPath(db, path);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const count = await countSubmissions(db, session.id);
  return NextResponse.json({ count });
}
