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
  getParticipantSnapshot,
  reassignShortStudyReader,
} from "@/lib/gathering/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const expectedState =
      typeof body.expectedState === "string"
        ? body.expectedState.trim().slice(0, 100)
        : "";
    const expectedRevision =
      typeof body.expectedRevision === "number" &&
      Number.isSafeInteger(body.expectedRevision)
        ? body.expectedRevision
        : -1;
    if (!expectedState) {
      throw new GatheringError(
        "The current activity state is required.",
        "EXPECTED_STATE_REQUIRED",
      );
    }
    if (expectedRevision < 0) {
      throw new GatheringError(
        "The current gathering revision is required.",
        "EXPECTED_REVISION_REQUIRED",
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
    const result = await reassignShortStudyReader({
      sessionTokenHash: tokenHash,
      expectedState,
      expectedRevision,
    });
    return NextResponse.json(
      {
        snapshot: await getParticipantSnapshot(tokenHash),
        reassigned: result === "changed",
        result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
