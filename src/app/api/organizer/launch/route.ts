import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/gathering/http";
import { getOrganizerSnapshot, launchGathering } from "@/lib/gathering/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await launchGathering();
    return NextResponse.json(await getOrganizerSnapshot());
  } catch (error) {
    return errorResponse(error);
  }
}
