# Day of Prayer

A mobile-first room-handoff app for one live, in-person Day of Prayer
gathering. Participants join from one shared link, wait in a synchronized
lobby, and receive an immediate hidden room assignment. The organizer monitors
provisional rosters at `/admin`, then reveals assignments with each room’s
first participant as leader.

The guided prayer experience after people reach their rooms is intentionally
deferred.

## Stack

- Next.js 15 App Router and TypeScript
- PostgreSQL and Prisma
- Tailwind CSS
- Railway
- Vitest

## Local development

Requires Node 22+, pnpm 10, and PostgreSQL 16.

```bash
pnpm install
cp .env.example .env
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

Set `DATABASE_URL` to the local database. Generate the prayer-request encryption
key with:

```bash
openssl rand -base64 32
```

Put the result in `PRAYER_REQUEST_ENCRYPTION_KEY`. Keep this key stable while
stored prayer requests need to remain readable.

Open:

- Participant experience: `http://localhost:3000/`
- Organizer experience: `http://localhost:3000/admin`
- Database-backed health: `http://localhost:3000/api/health`

## Verification

```bash
pnpm verify
pnpm db:check
pnpm test:integration
```

The integration test needs the same `DATABASE_URL` and
`PRAYER_REQUEST_ENCRYPTION_KEY` environment variables as the application.

### Guarded 50-participant load run

The load script uses the target database's existing seeded rooms and resets the
active gathering before and after the run. It never modifies room
configuration, refuses to start without an explicit confirmation, and refuses
remote targets unless separately allowed.

```bash
LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_CONFIRM=room-handoff \
pnpm load:room-handoff
```

For a remote non-production test environment, also set
`LOAD_TEST_ALLOW_REMOTE=yes`.

## Event operation

1. Run `pnpm db:seed` once in each new environment to seed the physical rooms
   outside the event-day application. Every finite capacity must be at least
   two and at least one room must be unlimited.
2. Open `/admin`, share the participant root link, and watch live provisional
   rosters fill in deterministic room order.
3. Reveal once everyone expected has arrived. Existing assignments become
   visible and are final until reset.
4. Participants can still join afterward. Each late arrival is assigned to the
   first configured smallest eligible room without moving existing members or
   replacing an existing leader.
5. Expand room cards before or after reveal to inspect rosters and leaders.
6. Reset only when the run is finished or before a test run. Reset deletes live
   participant and prayer-request rows but does not control the separate
   retention period of provider-managed database backups.

## Railway

`railway.toml` applies Prisma migrations as a pre-deploy command, starts the
standalone Next.js server, and checks `/api/health`.

Configure the app service with:

- `DATABASE_URL` referencing the Railway PostgreSQL service
- `PRAYER_REQUEST_ENCRYPTION_KEY` containing a stable base64-encoded 32-byte key

Do not set `PGSSLMODE` when using Railway’s private Postgres network.

## Product and architecture

- [Current domain context](CONTEXT.md)
- [Room-handoff product and implementation plan](docs/plans/2026-07-25-001-feat-participant-room-handoff-plan.md)
- [Architecture decisions](docs/adr/)
- [Historical superseded matcher specification](docs/prayer-activity-spec.md)

Contributors should read [AGENTS.md](AGENTS.md) before making changes.
