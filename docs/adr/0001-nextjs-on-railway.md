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

Prisma uses its PostgreSQL driver adapter for the scaffold's connection-only
health check, proving reachability with zero schema commitment. Prisma Client
generation is established here, while **domain models and migrations remain
deferred to ticket #2** (Data model + migrations).

## Consequences

- All later tickets assume Next.js App Router + TypeScript.
- Railway builds with Nixpacks; deploy config lives in `railway.toml`
  (pnpm start command + `/api/health` healthcheck).
- Ticket #2 extends the model-free Prisma schema with the locked domain model
  and migrations rather than replacing the connection layer.

## Amendments

- **Amended by [#24](https://github.com/JesusFilm/dop/issues/24) (auto-purge
  job):** the next-morning purge does **not** hit an in-app route as the "One
  deploy pipeline" reasoning above anticipated. It runs as a **second Railway
  service** (`railway.purge.toml`, `pnpm purge`) talking to Postgres on the
  private network. An in-app route that deletes every due session's requests
  would be an internet-reachable destructive endpoint needing its own shared
  secret; the cron service already holds `DATABASE_URL` and has no public
  domain. The single-service reasoning still stands for the web app itself —
  what changed is that scheduled work gets its own service rather than a route.
  Railway config-as-code is per service, so each such service adds a
  `railway*.toml` (see `AGENTS.md`). If the reveal backstop
  ([#23](https://github.com/JesusFilm/dop/issues/23)) lands as a second cron
  service, replace this amendment with an ADR on how scheduled work runs.
