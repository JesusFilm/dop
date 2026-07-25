---
title: Destructive jobs must name the target they acted on
date: 2026-07-25
category: docs/solutions/design-patterns
module: Auto-purge job (Day of Prayer)
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "A destructive or irreversible job (purge, delete, migrate, reset) can be run by hand by an operator, not only by a scheduler"
  - "The connection target comes from ambient config (a dotenv file, an exported variable, a shell profile) that differs between a laptop and production"
  - "A runbook teaches an operator to read one specific line of output as proof the work happened"
  - "You are removing a crash or hard failure from a command whose failure mode is the operator's only signal"
  - "A no-op is a legitimate outcome, so \"nothing to do\" and \"pointed at the wrong thing\" produce identical output"
root_cause: config_error
resolution_type: code_fix
tags:
  - destructive-operations
  - operator-tooling
  - silent-failure
  - observability
  - dotenv
  - runbook
  - credential-hygiene
related_components:
  - database
  - background_job
  - documentation
---

# Destructive jobs must name the target they acted on

## Context

`pnpm purge` is the by-hand fallback for the cron that deletes prayer-request
submissions the morning after an event — the mechanism behind this app's whole
privacy promise. An operator runs it when the scheduled job did not fire.

Code review found the fallback could not run at all: it died with
`DATABASE_URL is not set`, because neither Node nor `tsx` loads a `.env` file
implicitly and `pnpm purge` is `tsx scripts/purge-submissions.ts`
(`package.json:21`). The error comes from `buildDatabaseConfig`
(`src/lib/db.ts:20-22`), which throws when the variable is absent.

The obvious fix — `import "dotenv/config"`, matching the existing convention at
`prisma.config.ts:1` — cured the crash and introduced a worse failure. This
repo's `.env.example:8` tells developers to point `.env` at their **local**
Postgres. So the repaired command, run from a laptop, connected to that local
database, found nothing due, and printed:

```
$ pnpm purge
Auto-purge: nothing due at 2026-07-28T18:00:00Z    (exit 0)
```

That is the exact line the runbook teaches an operator to read as proof of
deletion — `README.md:138-139` says to read the logs and that "with nothing due
it logs `Auto-purge: nothing due at …`". Nothing in the output distinguished
*the event's database is already clean* from *you just queried your laptop and
the requests are still live*. A loud crash had become a confident false report,
in the fallback path for a privacy-critical delete.

Approaches considered and rejected along the way:

- **Leave the crash in place.** Not viable: the runbook documents this as the
  preferred recovery path and it could not run. (`scripts/check-database.ts` had
  the identical latent gap, and only appeared to work because the `prisma
  generate` step ahead of it loads dotenv in a separate process.)
- **Tell the operator to put the production URL in `.env`.** Asks someone under
  time pressure to edit a file the repo says points at localhost, and leaves a
  production credential on a laptop.
- **Add an "are you sure?" prompt.** Confirms nothing. The operator *is* sure;
  they are pointed at the wrong database. Confirmation without naming the target
  just adds a keystroke.

## Guidance

**When a command's failure mode is the operator's only signal, making it quieter
is a regression — even when you are removing a real bug.** A crash is a
functioning safety interlock. Before silencing one, ask:

> What does this tool print when it is pointed at the wrong thing?

If the answer is "the same thing it prints when everything is fine", the fix is
not finished.

Four concrete practices, as applied here:

1. **State what was acted on, on every outcome path** — including, especially,
   the no-op path. A no-op and a mis-targeted run are the pair that look
   identical, so the "nothing happened" line is the dangerous one. All three
   branches carry the target (`scripts/purge-submissions.ts:34-51`).
2. **Give the "nothing happened" line the operator's next check.** Not just
   `nothing due`, but `… If you expected a purge, check that ${target} is the
   event's database.` (`scripts/purge-submissions.ts:36`). An assertion plus how
   to falsify it.
3. **Render the identifier with a pure function that strips credentials and
   never throws** (`src/lib/db.ts:43-59`). Logging a raw connection string leaks
   a password; letting the describer throw reintroduces a crash in the name of
   preventing one.
4. **Runbooks for production-touching commands pass credentials inline, never
   through the dev `.env`** (`README.md:156-167`), and say why.

## Why This Matters

**The root cause was never the missing dotenv load.** It was that a destructive
job's output did not identify what it acted on, so two very different states
produced byte-identical, reassuring text. Naming the target closes that gap
without reintroducing the crash: once the line reads
`… nothing due … in localhost:5432/secret_prayer …`, the mistake is self-evident
to an operator who has never read the code.

**The inline form beats `.env` because dotenv does not overwrite.** Verified in
the installed dependency rather than assumed: dotenv 17.2.3
(`node_modules/dotenv/package.json:3`) reads
`const override = Boolean(options && options.override)` at
`node_modules/dotenv/lib/main.js:383` — defaulting to false — and only assigns
over an already-present key when `override === true` (lines 395-397).
`import "dotenv/config"` passes no options, so an inline prefix, an `export`, or
a platform-injected value wins over the `.env` line.

That same property is what makes the dotenv load safe in production: Railway
injects `DATABASE_URL` into the cron service (`README.md:133-136`), the
container has no `.env`, and dotenv would not overwrite the injected value if it
did. The reasoning is recorded at the call site
(`scripts/purge-submissions.ts:1-3`).

**Cost of missing it.** In the multi-agent code review of this branch, three
lenses (security, adversarial, correctness) each flagged this independently and
a separate validator reproduced it by running the command — but only *after* the
quieter version had already shipped to the branch, passing a green test suite and
CI. (That review ran in-session; it is not recorded as GitHub review comments on
the PR.) Tests do not catch a signal that is technically correct and practically
misleading; only asking the wrong-target question does.

## When to Apply

Reach for this whenever a command can destroy data and a human can run it. The
sharpest form of the trigger: **a job whose legitimate outcome includes "I did
nothing"**, whose target is resolved from ambient config, and whose printed
result is what a runbook treats as verification. All three were true here, and
each one alone is enough to make the output ambiguous.

It applies with less force to read-only diagnostics — noted as an open
follow-up: `scripts/check-database.ts:11-13` prints
`Database connection succeeded` / `Database connection failed` without naming
its target either. Lower stakes, same rule.

## Examples

The describer — pure, credential-stripping, non-throwing
(`src/lib/db.ts:43-59`):

```ts
export function describeDatabaseTarget(
  connectionString: string | undefined,
): string {
  if (!connectionString) {
    return "unknown (DATABASE_URL unset)";
  }

  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, "");
    return database ? `${url.host}/${database}` : url.host;
  } catch {
    // Never let a logging nicety break the job; the connection attempt itself
    // surfaces a malformed URL.
    return "unknown (unparsable URL)";
  }
}
```

`url.host` excludes userinfo, so username and password cannot reach the log.
Unset and unparsable inputs return a label rather than throwing
(`src/lib/db.ts:46-48`, `54-58`).

Computed once, before any work, outside the `try` so even the failure branch can
name it (`scripts/purge-submissions.ts:29`):

```ts
const target = describeDatabaseTarget(process.env.DATABASE_URL);
```

Before and after, same command, same laptop:

```
# before: useless, but impossible to misread
$ pnpm purge
Auto-purge failed
Error: DATABASE_URL is not set                                    (exit 1)

# after the dotenv load alone: reads as success, touched nothing
$ pnpm purge
Auto-purge: nothing due at 2026-07-28T18:00:00Z                   (exit 0)

# after naming the target: the mistake is visible
$ pnpm purge
Auto-purge: nothing due at 2026-07-28T18:00:00Z in
localhost:5432/secret_prayer — no sessions past their purge time.
If you expected a purge, check that localhost:5432/secret_prayer
is the event's database.                                          (exit 0)
```

The test shape that locks it in — five cheap cases on the pure describer, which
is why it was extracted rather than inlined into the script
(`src/lib/db.test.ts:42-79`). Four of them, including the one that matters most
to this learning:

```ts
// 1. it names host + database
expect(
  describeDatabaseTarget(
    "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
  ),
).toBe("postgres.railway.internal:5432/railway");

// 2. a local target is distinguishable from a remote one — the whole point
expect(
  describeDatabaseTarget(
    "postgres://postgres:postgres@localhost:5432/secret_prayer",
  ),
).toBe("localhost:5432/secret_prayer");

// 3. it never leaks credentials into logs
const described = describeDatabaseTarget(
  "postgresql://admin:sup3r-s3cret@db.example.com/dop",
);
expect(described).not.toContain("sup3r-s3cret");
expect(described).not.toContain("admin");

// 4. bad input is labelled, not thrown
expect(describeDatabaseTarget(undefined)).toBe("unknown (DATABASE_URL unset)");
expect(describeDatabaseTarget("not-a-url")).toBe("unknown (unparsable URL)");
```

The runbook half of the fix (`README.md:156-167`):

```bash
DATABASE_URL='<the Railway Postgres URL>' PGSSLMODE=require pnpm purge
```

## Related

- [Server-authoritative time gating](./server-authoritative-time-gating.md) —
  sibling learning from the same Day-of-Prayer timing work, and the same stance
  that a cron is a nudge rather than the authority (`revealAt` there,
  `purgeAfter` here). **Different root cause and different prevention rule** —
  that one is about clock trust, this one about operator signal; they should not
  be conflated. (That doc is already on `main`; this link resolves once the
  branch carrying this file merges.)
- `CONCEPTS.md` — *Purge* and *App-clock authority*. This learning sharpens the
  *Purge* entry's verification claim: a zero reading verifies deletion only when
  the signal names what it inspected.
- `README.md` — the "Auto-purge" runbook, both the artifact that was wrong and
  the repaired surface.
- `docs/prayer-activity-spec.md` §8.4, §10 and Privacy #3 — where "the count is
  the verification" originates as a requirement.
- Issue #24 (auto-purge job + verification) and PR
  [#39](https://github.com/JesusFilm/dop/pull/39) — **open and pending review,
  not merged as of this writing**. The regression and its repair are two separate
  commits on that PR's branch: the dotenv load landed first on its own, and the
  target-naming fix followed after review. (Branch-local SHAs are deliberately
  not cited here — a squash merge rewrites them.)
- `docs/adr/0001-nextjs-on-railway.md` — amended in the same PR to record that
  the purge runs as a second Railway service rather than the in-app route the
  ADR originally anticipated.
