import { NextResponse } from "next/server";
import { GatheringError } from "@/lib/gathering/errors";
import {
  assertSameOrigin,
  errorResponse,
  parseOptionalCapacity,
  readJsonObject,
} from "@/lib/gathering/http";
import {
  addRoom,
  getOrganizerSnapshot,
  removeRoom,
  updateRoom,
} from "@/lib/gathering/service";

type RoomCommand = {
  action?: unknown;
  id?: unknown;
  name?: unknown;
  directions?: unknown;
  maxCapacity?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await readJsonObject(request)) as RoomCommand;

    if (body.action === "add") {
      await addRoom({
        name: stringValue(body.name),
        directions: stringValue(body.directions),
        maxCapacity: parseOptionalCapacity(body.maxCapacity),
      });
    } else if (body.action === "update") {
      await updateRoom({
        id: stringValue(body.id),
        name: stringValue(body.name),
        directions: stringValue(body.directions),
        maxCapacity: parseOptionalCapacity(body.maxCapacity),
      });
    } else if (body.action === "remove") {
      await removeRoom(stringValue(body.id));
    } else {
      throw new GatheringError("Unknown room action.", "INVALID_ROOM_ACTION");
    }

    return NextResponse.json(await getOrganizerSnapshot());
  } catch (error) {
    return errorResponse(error);
  }
}
