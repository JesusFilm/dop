# CONTEXT — Day of Prayer (QR prayer-request matcher)

A one-day, single-session, in-person prayer-request matcher. Full locked spec:
`docs/prayer-activity-spec.md`. Architectural decisions: `docs/adr/`.

## Glossary

Use these terms exactly in code, tests, and issues — don't drift to synonyms.

- **Session** — the single event instance (Monday 2026-07-27). Holds the
  organizer-set times and the unguessable setup path. Reuse later = "insert
  another Session", not a rewrite.
- **Submission** — one person's entry. Identity is the submission **id**, never
  the name. Carries `firstName` + `lastName`, the prayer `request`, a
  `deviceToken` (cookie) and a `recoveryCode` (bearer credential).
- **Group** — a matched set of Submissions: size 2, or exactly one size-3 when
  the count is odd. Requests are retrievable **only per-group**.
- **Reveal instant** (`revealAt`) — the single organizer-set moment when
  submissions hard-close **and** pairing becomes visible. `close = reveal`.
- **Freeze** (`pairingFrozenAt`) — the write-once, atomic single-winner moment
  the pairing is computed and locked. Never recomputed.
- **Recovery code** — short per-Submission credential to restore the return
  view on any device.
- **Purge** (`purgeAfter`) — the next-morning instant the session's Submissions
  (and their Groups) are deleted. The Session row itself stays, so the
  setup-page count reading **0** is the purge-verification view. The scheduler
  is only a trigger; the app clock decides what is due.
- **Setup path** — unguessable, no-auth, create-once organizer page that also
  produces the QR and takes the date/open/reveal time inputs.

## Stack (this ticket, #26)

Next.js (App Router, TS) + Postgres on Railway. Health at `/api/health`
(200 only when Postgres answers). See `docs/adr/0001-nextjs-on-railway.md` and
the "Railway setup" section of `README.md`.
