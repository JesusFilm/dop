import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GatheringError } from "@/lib/gathering/errors";
import {
  assertSameOrigin,
  errorResponse,
  readJsonObject,
} from "@/lib/gathering/http";
import { participantCookieName } from "@/lib/gathering/participant-session";
import { hashSessionToken } from "@/lib/gathering/session";
import {
  getParticipantSnapshot,
  takeOverLeader,
} from "@/lib/gathering/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const expectedRevision =
      typeof body.expectedRevision === "number" &&
      Number.isSafeInteger(body.expectedRevision)
        ? body.expectedRevision
        : -1;
    if (expectedRevision < 0) {
      throw new GatheringError(
        "The current gathering revision is required.",
        "EXPECTED_REVISION_REQUIRED",
      );
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(participantCookieName(request))?.value;
    if (!token) {
      throw new GatheringError(
        "Your participant session has expired.",
        "SESSION_REQUIRED",
        401,
      );
    }

    const tokenHash = hashSessionToken(token);
    await takeOverLeader({
      sessionTokenHash: tokenHash,
      expectedRevision,
    });
    return NextResponse.json(await getParticipantSnapshot(tokenHash));
  } catch (error) {
    return errorResponse(error);
  }
}
