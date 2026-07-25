# CONTEXT — Day of Prayer room handoff

A single live, in-person Day of Prayer gathering for roughly 30–50 people.
Participants join from one shared link, wait in a lobby, and receive a physical
room assignment when the organizer launches. The experience in this release
ends once everyone knows their room, group, and coordinator.

The product contract is
[`docs/plans/2026-07-25-001-feat-participant-room-handoff-plan.md`](docs/plans/2026-07-25-001-feat-participant-room-handoff-plan.md).
Architectural decisions live in [`docs/adr/`](docs/adr/).

## Glossary

Use these terms in code, tests, issues, and product copy.

- **Gathering** — the one active Day of Prayer event. It is either `FORMING` or
  `ASSIGNED` and can be reset for another run.
- **Participant** — a person who joins with a display name and optional personal
  prayer request. Their browser is remembered by an opaque cookie.
- **Room** — a configured physical space with a name, wayfinding directions, and
  optional maximum capacity. A non-empty configuration always includes an
  unlimited room.
- **Coordinator** — one participant selected randomly in each non-empty room.
  Any member can confirm an immediate takeover.
- **Launch** — the final transition that balances waiting participants across
  rooms and selects coordinators. Room setup is locked afterward.
- **Reset** — clears participants, requests, assignments, coordinators, and
  launch state while preserving room configuration.
- **Room handoff** — the participant screen showing the room, directions,
  fellow members, and current coordinator. Guided prayer begins after this
  release.

## Privacy boundary

Personal prayer requests are encrypted at rest and retained for a later guided
room experience. They never appear in participant room-handoff snapshots or the
organizer projection. Reset deletes them with the participant records.

## Stack

Next.js App Router + TypeScript, PostgreSQL through Prisma, Tailwind CSS, and
Railway. Health remains at `/api/health`. See
[`docs/adr/0001-nextjs-on-railway.md`](docs/adr/0001-nextjs-on-railway.md) and
[`docs/adr/0002-room-handoff-state.md`](docs/adr/0002-room-handoff-state.md).
