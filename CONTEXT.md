# CONTEXT — Day of Prayer room journey

A single live, in-person Day of Prayer gathering for roughly 30–50 people.
Participants join from one shared link, wait in a lobby, and receive a physical
room assignment immediately. The organizer sees provisional room rosters while
participants remain in the lobby; launch reveals those assignments. When a
valid journey is configured, each room then gathers and its leader leads
the room forward through the same ordered activities at its own pace.

The room-handoff product contract is
[`docs/plans/2026-07-25-001-feat-participant-room-handoff-plan.md`](docs/plans/2026-07-25-001-feat-participant-room-handoff-plan.md).
The journey framework contract is
[`docs/plans/2026-07-26-001-feat-room-journey-framework-plan.md`](docs/plans/2026-07-26-001-feat-room-journey-framework-plan.md).
Architectural decisions live in [`docs/adr/`](docs/adr/).

## Glossary

Use these terms in code, tests, issues, and product copy.

- **Gathering** — the one active Day of Prayer event. It is either `FORMING` or
  `ASSIGNED` and can be reset for another run.
- **Participant** — a person who joins with a display name and optional personal
  prayer request. Their browser is remembered by an opaque cookie.
- **Room** — a seeded, application-read-only physical space with a name,
  wayfinding directions, and optional maximum capacity. A finite maximum is at
  least two, and the configuration always includes an unlimited room.
- **Leader** — the first participant assigned to each non-empty room. Any
  member can confirm an immediate takeover after launch. The organizer sees the
  leader immediately; participants see them when assignments are revealed.
- **Launch** — reveals existing assignments and leader identities to
  participants without recalculating room membership. A configured journey
  enters its untimed gathering state; launch does not start a module timer.
- **Journey** — a reusable, database-configured ordered sequence of module
  instances shared by every room.
- **Module instance** — one placement of application-defined behavior in a
  journey, with its own title, configuration, order, and recommended duration.
- **Room journey** — a room's persistent gathering, current-module, timer, or
  completed state. Only its leader can move it forward.
- **Reset** — clears participants, requests, assignments, leaders, and
  room-journey progress while preserving room and reusable journey
  configuration.
- **Room handoff** — the participant screen showing the room, directions,
  fellow members, and current leader.

## Privacy boundary

Personal prayer requests are encrypted at rest. They never appear in the
framework's participant journey snapshots or organizer projection; a later
module will expose only its explicitly filtered request view. Reset deletes
requests with the participant records.

## Stack

Next.js App Router + TypeScript, PostgreSQL through Prisma, Tailwind CSS, and
Railway. Health remains at `/api/health`. See
[`docs/adr/0001-nextjs-on-railway.md`](docs/adr/0001-nextjs-on-railway.md) and
[`docs/adr/0002-room-handoff-state.md`](docs/adr/0002-room-handoff-state.md).
