---
title: Seed mutable room configuration once per environment
date: 2026-07-26
category: conventions
module: gathering-room-configuration
problem_type: convention
component: database
severity: medium
applies_when:
  - Known room configuration must be provisioned in a new environment
  - Organizers may edit or remove the provisioned rooms later
tags: [prisma, seed-data, rooms, railway, deployment]
---

# Seed mutable room configuration once per environment

## Context

The gathering uses a known set of physical rooms, but room records remain
editable operational configuration. Reset preserves those records, so they
should be provisioned once rather than recreated on every application deploy.

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
could recreate a room that an organizer intentionally removed.

## Why This Matters

One-time provisioning removes repetitive event setup without turning mutable
operational data into deployment-owned state. Name-based filtering avoids
duplicates when an organizer created a room before the seed ran, while the
launch-state guard preserves the product rule that room configuration is locked
after assignment.

## When to Apply

- A new local, test, or production database needs the standard room list.
- The standard list is a starting configuration rather than immutable reference
  data.
- Operators need to retain control over later room edits.

## Examples

The command reports how many rooms it created and how many were already
present. Running it again while the gathering is forming should create zero
duplicates. Running it after launch should fail without changing room
configuration.

## Related

- `CONTEXT.md`
- `docs/adr/0002-room-handoff-state.md`
- `src/lib/gathering/seed-rooms.ts`
