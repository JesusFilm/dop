import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PARTICIPANT_COOKIE } from "@/lib/gathering/constants";
import { GatheringError } from "@/lib/gathering/errors";
import { assertSameOrigin, errorResponse } from "@/lib/gathering/http";
import { hashSessionToken } from "@/lib/gathering/session";
import {
  getParticipantSnapshot,
  takeOverCoordinator,
} from "@/lib/gathering/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(PARTICIPANT_COOKIE)?.value;
    if (!token) {
      throw new GatheringError(
        "Your participant session has expired.",
        "SESSION_REQUIRED",
        401,
      );
    }

    const tokenHash = hashSessionToken(token);
    await takeOverCoordinator(tokenHash);
    return NextResponse.json(await getParticipantSnapshot(tokenHash));
  } catch (error) {
    return errorResponse(error);
  }
}
