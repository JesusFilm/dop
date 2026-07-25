import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/gathering/http";
import { getOrganizerSnapshot } from "@/lib/gathering/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getOrganizerSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
