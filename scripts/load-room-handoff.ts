const baseUrl = process.env.LOAD_TEST_BASE_URL;
const confirmation = process.env.LOAD_TEST_CONFIRM;

if (!baseUrl || confirmation !== "room-handoff") {
  throw new Error(
    "Set LOAD_TEST_BASE_URL and LOAD_TEST_CONFIRM=room-handoff to run the destructive gathering load test.",
  );
}

export {};

const appOrigin = new URL(baseUrl).origin;
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname) &&
  process.env.LOAD_TEST_ALLOW_REMOTE !== "yes"
) {
  throw new Error(
    "Remote load tests also require LOAD_TEST_ALLOW_REMOTE=yes because reset clears active gathering data.",
  );
}

async function post(path: string, body?: unknown, cookie?: string) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Origin: appOrigin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      `${path} failed (${response.status}): ${JSON.stringify(result)}`,
    );
  }
  return {
    result,
    cookie: response.headers.getSetCookie()[0]?.split(";")[0],
  };
}

async function main() {
  const startedAt = performance.now();
  await post("/api/organizer/reset");
  const current = await fetch(new URL("/api/organizer", baseUrl)).then(
    (response) => response.json(),
  );
  for (const room of current.rooms ?? []) {
    await post("/api/organizer/rooms", { action: "remove", id: room.id });
  }
  for (let index = 1; index <= 6; index += 1) {
    await post("/api/organizer/rooms", {
      action: "add",
      name: `Load Room ${index}`,
      directions: `Load-test location ${index}`,
      maxCapacity: index === 1 ? null : 12,
    });
  }

  const participants = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      post("/api/participant", {
        displayName: `Load Participant ${index + 1}`,
        prayerRequest: `Private load request ${index + 1}`,
      }),
    ),
  );
  await post("/api/organizer/launch");

  const roomSnapshots = await Promise.all(
    participants.map(({ cookie }) =>
      fetch(new URL("/api/participant", baseUrl), {
        headers: cookie ? { Cookie: cookie } : undefined,
      }).then((response) => response.json()),
    ),
  );
  if (roomSnapshots.some((snapshot) => snapshot.state !== "ROOM")) {
    throw new Error("At least one participant did not receive a room.");
  }

  await post(
    "/api/participant/coordinator",
    undefined,
    participants[0]?.cookie,
  );
  const late = await post("/api/participant", {
    displayName: "Late Load Participant",
    prayerRequest: "Late private request",
  });
  if (late.result.state !== "ROOM") {
    throw new Error("Late participant did not receive a room.");
  }

  const organizer = await fetch(new URL("/api/organizer", baseUrl)).then(
    (response) => response.json(),
  );
  if (JSON.stringify(organizer).includes("Private load request")) {
    throw new Error("Organizer projection exposed a prayer request.");
  }

  await post("/api/organizer/reset");
  console.log(
    JSON.stringify({
      status: "ok",
      participants: 50,
      lateParticipants: 1,
      rooms: 6,
      elapsedMs: Math.round(performance.now() - startedAt),
    }),
  );
}

void main();
