# Day of Prayer — QR prayer-request matcher

A one-day, single-session, in-person prayer-request matcher. This repo currently
holds the **Railway scaffold**
([#26](https://github.com/JesusFilm/dop/issues/26), build-plan step 1): a
Next.js app with Postgres
attached and a health route that proves the whole loop end-to-end. No product
behaviour yet.

- Full spec: [`docs/prayer-activity-spec.md`](docs/prayer-activity-spec.md)
- Domain glossary: [`CONTEXT.md`](CONTEXT.md)
- Framework decision: [`docs/adr/0001-nextjs-on-railway.md`](docs/adr/0001-nextjs-on-railway.md)

## Stack

- **Next.js 15** (App Router, TypeScript) — one full-stack service
- **Postgres + Prisma** — reached via `DATABASE_URL`; domain models and migrations remain deferred
- **Railway** — build (Nixpacks) + Postgres + cron on one platform
- **Vitest** — unit tests

## Local development

Requires Node ≥ 22.12, pnpm 10, and a reachable Postgres.

```bash
pnpm install
cp .env.example .env          # then edit DATABASE_URL to your local Postgres
pnpm dev                      # http://localhost:3000
```

Quickest local Postgres (Docker):

```bash
docker run --name secret-prayer-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=secret_prayer -p 5432:5432 -d postgres:16
```

Then visit **http://localhost:3000/api/health** — it returns `200` with
`{"status":"ok","database":"ok",...}` when Postgres answers, `503`
(`"database":"error"`) when it does not.

### Checks

```bash
pnpm verify          # format, lint, types, tests, Prisma validation, build
pnpm db:check        # live Prisma → PostgreSQL connection check
```

## Environment variables

| Variable       | Local                                | Railway                                                       |
| -------------- | ------------------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL` | set in `.env` to your local Postgres | reference the Postgres plugin: `${{ Postgres.DATABASE_URL }}` |
| `PGSSLMODE`    | unset                                | unset on the private network; `require` only for public conns |
| `PORT`         | unset (defaults to 3000)             | set automatically by Railway                                  |

No credentials are committed — `.env` is gitignored; `.env.example` is the
template.

## Railway setup (manual — one-time)

Railway account actions can't be automated from here, so do these once in the
Railway dashboard. After this, every push to the default branch auto-deploys.

1. **Create the project + connect the repo**
   - Railway → **New Project** → **Deploy from GitHub repo** → pick
     `JesusFilm/dop`.
   - This creates the **app service**. Railway detects `railway.toml` and builds
     with Nixpacks (`pnpm build` → `pnpm start`).

2. **Add Postgres**
   - In the project → **New** → **Database** → **Add PostgreSQL**.
   - This provisions a Postgres service that exposes `DATABASE_URL` on its own
     private networking.

3. **Wire `DATABASE_URL` into the app service**
   - Open the **app service** → **Variables** → **New Variable**.
   - Name: `DATABASE_URL`, Value: `${{ Postgres.DATABASE_URL }}`
     (Railway's reference syntax — resolves to the Postgres plugin's URL over the
     private network, no TLS needed).
   - Do **not** set `PGSSLMODE` (private network is plaintext).

4. **Confirm the deploy pipeline**
   - The app service **Settings → Deploy** should have a **default branch**
     (e.g. `main`) with auto-deploy on. Pushing to it triggers build → deploy.
   - Health check path is already `/api/health` (from `railway.toml`); the
     deploy goes healthy only once Postgres is reachable.

5. **Get the public URL + verify**
   - App service → **Settings → Networking → Generate Domain**.
   - Visit `https://<your-domain>/api/health` — expect **200** and
     `{"status":"ok","database":"ok",...}`. That confirms push-to-deploy + app +
     Postgres end-to-end.

> A later ticket adds the Railway **cron** service for the reveal backstop. The
> next-morning purge cron is set up below.

## Auto-purge (next-morning delete)

All submissions are deleted the morning after the event (spec §8.4, §10,
Privacy #3). The organizer's setup-page **submission count is the verification
view**: once the purge has run it reads **0**.

The `Session` row (times, setup path, QR) is kept on purpose — it is what makes
that verification view renderable. Only the submissions and their derived groups
are deleted.

The purge instant (`purgeAfter`) is derived at setup from the event date: the
next day at **06:00 Pacific/Auckland**. The cron schedule is only a **trigger** —
`pnpm purge` deletes only sessions whose `purgeAfter` has already passed, so it
is idempotent, a no-op when nothing is due, and self-heals a missed run. It runs
hourly: because `purgeAfter` is always the top of an hour, an hourly trigger
lands on the configured instant in both NZST and NZDT with no DST-specific
expression.

The cron service runs `pnpm purge` against Postgres on the private network
rather than calling an in-app route (as the scaffold notes above once sketched):
a route that deletes requests would be a destructive, internet-reachable
endpoint needing its own shared secret, and the cron service already has
`DATABASE_URL`.

### One-time Railway setup

1. **Add a second service from this repo**
   - Railway → project → **New** → **GitHub Repo** → `JesusFilm/dop`.
   - Name it e.g. `purge-cron`.
2. **Point it at the cron config**
   - Service → **Settings → Config-as-code** → set the file path to
     `railway.purge.toml`. That file sets `startCommand = "pnpm purge"`, the
     hourly `cronSchedule`, and `restartPolicyType = "NEVER"` (a cron run is a
     one-shot job, not a long-running server). No healthcheck — the container
     exits when the job finishes.
3. **Give it the database**
   - Service → **Variables** → `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}`
     (same reference as the app service; leave `PGSSLMODE` unset on the private
     network).
4. **Verify**
   - Service → **Deployments** → trigger a run and read the logs: with nothing
     due it logs `Auto-purge: nothing due at …`.
   - The morning after the event, open the setup page — the count reads **0**.

### If the cron did not fire

Check the setup page first: a count above 0 the morning after the event means
the purge has not run. Then, in order of preference:

1. **Run the job by hand** (preferred — same code path, same safety checks).

   From **Railway's shell** on either service, where `DATABASE_URL` is already
   set:

   ```bash
   pnpm purge
   ```

   **From your laptop, pass the Railway URL inline** — do not put it in `.env`:

   ```bash
   DATABASE_URL='<the Railway Postgres URL>' PGSSLMODE=require pnpm purge
   ```

   An inline (or exported) value always wins over `.env`. This matters: your
   `.env` points at your **local** Postgres, and a bare `pnpm purge` would run
   there, find nothing due, and print a clean-looking result while the event's
   requests are untouched. Every log line names the database it acted on
   (`host:port/database`) — read it and confirm it is the event's database, not
   `localhost`.

2. **Manual DB delete** (fallback when the app or its tooling is unavailable).
   Railway → **Postgres service → Data / Query**, or `psql "$DATABASE_URL"`:

   ```sql
   -- Delete the derived groups first, then the submissions they reference.
   -- Keep the sessions row so the setup page still renders the 0 count.
   -- Column names are quoted camelCase (Prisma default).
   BEGIN;
   DELETE FROM "groups"
   WHERE "sessionId" IN (SELECT "id" FROM "sessions" WHERE "purgeAfter" <= now());
   DELETE FROM "submissions"
   WHERE "sessionId" IN (SELECT "id" FROM "sessions" WHERE "purgeAfter" <= now());
   COMMIT;
   ```

   To purge a specific session regardless of its purge time, replace the
   sub-select with `WHERE "sessionId" = '<session id>'`. Confirm with:

   ```sql
   SELECT count(*) FROM "submissions";   -- expect 0
   ```

   Then reload the setup page — the count reads **0**.

## Agent contributors

Read `AGENTS.md` before making changes.
It preserves the repository's local skills and domain-document rules, and adds the required Compound Engineering workflow.
