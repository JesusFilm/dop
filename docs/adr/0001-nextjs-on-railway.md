# ADR-0001: Next.js (App Router) on Railway

- **Status:** Accepted
- **Date:** 2026-07-24
- **Context ticket:** [Build: Project + Railway scaffold #26](https://github.com/JesusFilm/dop/issues/26)
- **Builds on:** stack decisions [#5](https://github.com/edmonday/secret-prayer/issues/5) (host = Railway) and [#4](https://github.com/edmonday/secret-prayer/issues/4) (stack survey)

## Decision

Build the prayer-activity app as a single **Next.js (App Router, TypeScript)**
application deployed on **Railway**, with **Postgres** attached as a Railway
plugin and reached via the injected `DATABASE_URL`.

## Why

The locked spec (`docs/prayer-activity-spec.md`) fixes the **host** (Railway,
#5/#9) but leaves the **app framework** open ("the chosen app framework"). The
downstream tickets need one full-stack framework that covers all of:

- **Rich client screens** — starter chips, Web Share API "save code as image",
  canvas QR rendering (§7). React is the ergonomic fit; the stack survey (#4)
  already leaned React/Next (Vercel+Neon) before Railway superseded the host.
- **Server-authoritative behaviour** — app-clock reveal gating, hard submission
  cutoff, the atomic single-winner pairing freeze (§4–5). Next.js route handlers
  and server components give a server that owns these without a second service.
- **One deploy pipeline** — a single Next.js service on Railway (push → deploy)
  satisfies the #26 "one deploy pipeline" criterion; Railway cron can hit
  in-app routes for the reveal backstop and next-morning purge (§8) without
  extra runtimes.

`pg` (node-postgres) is used directly for the scaffold's health check to prove
reachability with zero schema commitment. **The ORM/migration choice is
deliberately deferred to ticket #2** (Data model + migrations).

## Consequences

- All later tickets assume Next.js App Router + TypeScript.
- Railway builds with Nixpacks; deploy config lives in `railway.json`
  (start command + `/api/health` healthcheck).
- If a heavier data layer (Prisma/Drizzle) is chosen in #2, the raw `pg` pool in
  `src/lib/db.ts` is either kept for lightweight checks or replaced — an
  isolated, low-cost change.
