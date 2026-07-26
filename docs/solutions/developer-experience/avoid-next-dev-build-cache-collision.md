---
title: Avoid Next.js development and production build cache collisions
date: 2026-07-27
category: developer-experience
module: local verification
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - "Running `pnpm verify` while a local `pnpm dev` preview is active"
  - "The local preview starts returning stale chunk, manifest, or internal server errors after a build"
tags:
  - nextjs
  - development-workflow
  - verification
  - build-cache
---

# Avoid Next.js development and production build cache collisions

## Context

This repository's `pnpm dev` and `pnpm build` scripts both use Next.js's
default `.next` output directory. Running `pnpm verify`, which ends with
`pnpm build`, while the development server is still active can leave the
preview reading artifacts that the production build has replaced.

The visible symptom can arrive after the verification command succeeds:
the browser begins returning internal server errors or reports missing and
stale chunks or manifests.

## Guidance

Stop the development server before running the full verification gate:

```bash
pnpm verify
```

After verification finishes, restart `pnpm dev`. If the preview still reports
cache-shaped errors, stop it again, remove only the repository's `.next`
directory, and restart the development server.

Do not clean `.next` while either `next dev` or `next build` is running. The
cleanup is recovery for an already-stale local cache, not a routine production
step.

## Why This Matters

The production build can be fully green while the already-running development
server is broken, because the two processes are using the same generated
artifact directory for different purposes. Serializing those processes keeps
the local acceptance preview trustworthy and prevents a cache collision from
being mistaken for an application regression.

## When to Apply

- Before the final `pnpm verify` run for a branch.
- When browser acceptance must continue after a production build.
- When a local-only internal server error appears immediately after verification.

## Examples

Preferred order:

1. Stop `pnpm dev`.
2. Run `pnpm verify`.
3. Start `pnpm dev` again only if more browser acceptance is needed.
4. If the restarted preview is still stale, stop it, delete `.next`, and restart.

## Related

- `package.json` defines `dev` as `next dev`, `build` as `next build` plus
  standalone preparation, and `verify` as the full quality gate ending in
  `pnpm build`.
