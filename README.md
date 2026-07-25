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

> Later tickets add Railway **cron** services (reveal backstop, next-morning
> purge). Those are separate cron services in the same project pointing at
> in-app routes — not needed for this scaffold.

## Agent contributors

Read `AGENTS.md` before making changes.
It preserves the repository's local skills and domain-document rules, and adds the required Compound Engineering workflow.
