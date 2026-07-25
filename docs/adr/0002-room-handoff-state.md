# ADR 0002: Persist and synchronize the room handoff through PostgreSQL

- Status: Accepted
- Date: 2026-07-26

## Context

Thirty to fifty participant phones and an organizer screen need to converge on
one gathering state across reloads, reconnects, and Railway process restarts.
Launch, late joins, coordinator takeover, room edits, and reset can arrive
concurrently. Personal prayer requests are sensitive and must not enter
organizer-facing data.

## Decision

Use one PostgreSQL-backed active `Gathering` with persistent `Room` and
`Participant` records. Serialize lifecycle mutations in transactions under a
gathering row lock, with bounded retry for PostgreSQL serialization conflicts.

Use an opaque HttpOnly browser cookie for same-device participant continuity,
storing only its SHA-256 digest. Encrypt non-empty personal prayer requests with
AES-256-GCM using `PRAYER_REQUEST_ENCRYPTION_KEY`.

Expose separate participant and organizer snapshots through App Router Route
Handlers. Clients poll the authoritative snapshots every second while visible,
with slower retries after failures; no process memory is authoritative. The
organizer projection contains names, rooms, and coordinator state but never
prayer-request fields.

## Consequences

- Reloads, reconnects, deploys, and multiple app instances retain consistent
  gathering state.
- Launch and concurrent joins cannot partially assign or silently overfill a
  room.
- The app requires PostgreSQL migrations before startup and a stable encryption
  key in every deployed environment.
- Polling adds a small, predictable query load but avoids WebSocket and pub/sub
  infrastructure for the current 50-person target.
- Losing the encryption key makes retained prayer requests unreadable.
