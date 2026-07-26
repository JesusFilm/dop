import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PARTICIPANT_COOKIE } from "@/lib/gathering/constants";
import { GatheringError } from "@/lib/gathering/errors";
import {
  assertSameOrigin,
  errorResponse,
  readJsonObject,
} from "@/lib/gathering/http";
import { hashSessionToken } from "@/lib/gathering/session";
import {
  advanceRoomJourney,
  getParticipantSnapshot,
} from "@/lib/gathering/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const expectedState =
      typeof body.expectedState === "string"
        ? body.expectedState.trim().slice(0, 100)
        : "";
    if (!expectedState) {
      throw new GatheringError(
        "The current journey state is required.",
        "EXPECTED_STATE_REQUIRED",
      );
    }

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
    await advanceRoomJourney({ sessionTokenHash: tokenHash, expectedState });
    return NextResponse.json(await getParticipantSnapshot(tokenHash), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
