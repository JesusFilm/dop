import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PARTICIPANT_COOKIE,
  PARTICIPANT_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/gathering/constants";
import {
  assertSameOrigin,
  errorResponse,
  readJsonObject,
} from "@/lib/gathering/http";
import { createSessionToken, hashSessionToken } from "@/lib/gathering/session";
import {
  getParticipantSnapshot,
  joinParticipant,
} from "@/lib/gathering/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PARTICIPANT_COOKIE)?.value;
    const snapshot = await getParticipantSnapshot(
      token ? hashSessionToken(token) : undefined,
    );
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const cookieStore = await cookies();
    const rememberedToken = cookieStore.get(PARTICIPANT_COOKIE)?.value;
    const token = rememberedToken ?? createSessionToken();

    await joinParticipant({
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      prayerRequest:
        typeof body.prayerRequest === "string" ? body.prayerRequest : "",
      sessionTokenHash: hashSessionToken(token),
    });

    const snapshot = await getParticipantSnapshot(hashSessionToken(token));
    const response = NextResponse.json(snapshot, { status: 201 });
    response.cookies.set(PARTICIPANT_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PARTICIPANT_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
