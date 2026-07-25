# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Event & participants

### Session

One run of the event — the single container that keys all data for a given day. The app is single-session: a scanned QR resolves "the one session," and reuse later means inserting another Session rather than rewriting.

A Session owns its Submissions and Groups and carries the event's configured times (open, reveal, purge) and the moment its pairing was frozen. All reads are Session-scoped.

### Submission

One participant's entry: their name and the thing they'd like prayer for. **Identity is the submission itself, never the name** — two people with the same full name are two distinct Submissions. The full name is a display label so paired people can find each other in the room, not a key.

Each device may hold at most one Submission per Session. It is reachable to its owner two ways: the device cookie, or a one-time recovery code shown at submit.

### Group

A write-once assignment binding participants together so each can see who they're praying for. Every Group has at least two distinct members; membership is mutual. Groups are the **only** path by which a prayer request becomes visible — and only to that Group's own members.

### Pairing

The named process that shuffles a Session's Submissions into Groups (pairs, with one larger Group when the count is odd). Runs once per Session.

### Pairing freeze

The moment Pairing's result is committed and made permanent. It is single-winner and atomic: concurrent triggers at the boundary resolve to exactly one computation, and a frozen Group never changes.

## Timing & reveal

### Reveal time

The one organizer-set instant at which submissions close **and** paired content becomes visible — "close = reveal," a single boundary, not two. Everything time-dependent in the app is decided by comparing the current moment to this instant.

### Open time

The organizer-set instant at which the Session begins accepting Submissions. The open-to-reveal window is when participants submit.

### App-clock authority

The principle that the running application's own clock — not any scheduler or trigger — is the sole authority for whether the Reveal time has passed. Schedulers may drift and only _nudge_ computation; the sharp boundary is always the app's own comparison of now against the Reveal time.

Authority is exercised per request. A view already delivered to a device carries the decision made at the moment it was rendered, and it does not become wrong quietly — it stays confidently stale. Any surface a participant may still be looking at when the Reveal time arrives must therefore ask the app again rather than assume; a screen that tells someone to wait for the boundary is the one most certain to be open across it — see [Server-authoritative time gating](docs/solutions/design-patterns/server-authoritative-time-gating.md).

### Hard cutoff

The rule that, once the app clock reaches the Reveal time, the server rejects new or edited Submissions outright. Late arrivals miss the window by design and are handled in person.

### Purge

The next-morning deletion of a Session's Submissions. After it runs, the live submission count reads zero, which doubles as the verification that data is gone.

A zero is verification only when the signal names what it inspected. A count or log line that does not identify its database and Session can read zero because it looked in the wrong place — see [Destructive jobs must name the target they acted on](docs/solutions/design-patterns/destructive-jobs-must-name-their-target.md).
