---
title: Seed room configuration once per environment
date: 2026-07-26
category: conventions
module: gathering-room-configuration
problem_type: convention
component: database
severity: medium
applies_when:
  - Known room configuration must be provisioned in a new environment
  - Event-day room configuration is read-only in the application
tags: [prisma, seed-data, rooms, railway, deployment]
---

# Seed room configuration once per environment

## Context

The gathering uses a known set of physical rooms that remain read-only in the
event-day application. Reset preserves those records, so they should be
provisioned once rather than recreated on every application deploy.

## Guidance

Expose room provisioning as an explicit `pnpm db:seed` command. The seed should:

- create the active gathering when it does not exist;
- add only room names that are missing;
- use stable identifiers and `skipDuplicates` as a second idempotency guard;
- preserve existing room directions and capacities; and
- reject changes after the gathering has launched.

Run migrations before the seed in each new environment:

```bash
pnpm exec prisma migrate deploy
pnpm db:seed
```

Do not add `pnpm db:seed` to Railway's per-deploy command. An automatic seed
could unexpectedly change a deliberately managed environment.

## Why This Matters

One-time provisioning removes repetitive event setup without making room
creation an event-day responsibility. Name-based filtering avoids duplicates
when a room already exists, while the launch-state guard prevents provisioning
from changing an active gathering.

## When to Apply

- A new local, test, or production database needs the standard room list.
- Room changes are managed outside the event-day application.

## Examples

The command reports how many rooms it created and how many were already
present. Running it again while the gathering is forming should create zero
duplicates. Running it after launch should fail without changing room
configuration.

## Related

- `CONTEXT.md`
- `docs/adr/0002-room-handoff-state.md`
- `src/lib/gathering/seed-rooms.ts`
