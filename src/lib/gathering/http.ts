import { NextResponse } from "next/server";
import { GatheringError, isGatheringError } from "@/lib/gathering/errors";

const MAX_JSON_BODY_BYTES = 4_096;

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }

  if (!originHost || !requestHost || originHost !== requestHost) {
    throw new GatheringError(
      "This request did not come from the Day of Prayer app.",
      "INVALID_ORIGIN",
      403,
    );
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (isGatheringError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error("Gathering request failed", {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : "Unknown error",
  });
  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}

export function parseOptionalCapacity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 500
  ) {
    throw new GatheringError(
      "Maximum capacity must be a whole number between 1 and 500.",
      "INVALID_CAPACITY",
    );
  }
  return value;
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new GatheringError("Request body is too large.", "BODY_TOO_LARGE");
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new GatheringError(
          "Request body is too large.",
          "BODY_TOO_LARGE",
        );
      }
      chunks.push(value);
    }
  }

  const text = new TextDecoder().decode(
    chunks.length === 1
      ? chunks[0]
      : Uint8Array.from(chunks.flatMap((chunk) => [...chunk])),
  );

  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new GatheringError("Request body is not valid JSON.", "INVALID_JSON");
  }
}
