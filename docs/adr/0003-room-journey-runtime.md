# ADR 0003: Separate live journey configuration from room journey runtime

- Status: Accepted
- Date: 2026-07-26

## Context

Every physical room needs to follow the same ordered Day of Prayer journey
while its coordinator decides when that room moves forward. Participants must
return to the current activity after reload or late arrival, and advisory
timers must remain consistent without controlling progression. Individual
prayer activities will be designed and delivered separately.

## Decision

Persist reusable `Journey` and ordered `JourneyModule` records separately from
one `RoomJourney` runtime per room. A module instance stores a stable behavior
key, client-safe JSON configuration, title, position, and recommended duration.
Application code owns the registry that validates each behavior key and its
configuration. No production behavior is registered by this framework change.

The active gathering optionally references the live journey. Reveal validates
that journey through the application registry and creates untimed room runtime
records when it is valid. If it is absent or invalid, reveal keeps the existing
room-handoff-only behavior.

Start and advance are one coordinator-authorized, forward-only mutation under
the existing gathering row lock. Each request includes the state the
coordinator currently sees; a replay with a stale state is a no-op. Entering a
module persists one server start timestamp. Clients derive the recommended
countdown from that timestamp and duration, but reaching zero never changes
room state.

Participant and organizer clients continue to poll audience-specific snapshots
using the gathering revision. Participant snapshots expose only the viewer's
room and validated current-module configuration. Organizer snapshots expose
journey availability and room progress, not module configuration or personal
prayer requests.

Reset deletes room runtime and temporary module state with participants while
preserving reusable journey and module-instance configuration. Live journey
configuration is read directly from PostgreSQL and must not be edited during a
running gathering.

## Consequences

- Rooms remain synchronized internally while progressing independently.
- Reload, reconnect, coordinator takeover, and late arrival preserve the
  authoritative module and timer.
- Framework deployment is backward compatible before the first prayer module
  and production journey are configured.
- Future modules add registered behavior and database configuration without
  changing the progression protocol.
- There is intentionally no event-day journey editor, version, draft, snapshot,
  backward navigation, or automatic advancement.
- Operators are responsible for not changing live configuration during a
  gathering.
