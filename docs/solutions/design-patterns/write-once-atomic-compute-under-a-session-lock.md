---
title: Write-once atomic compute under a per-key advisory lock
date: 2026-07-25
category: docs/solutions/design-patterns
module: Pairing freeze (Day of Prayer)
problem_type: design_pattern
component: database
severity: medium
applies_when:
  - "A one-shot computation must run exactly once per key and its result frozen permanently (a draw, a match, a settlement, an allocation)"
  - "Several triggers can fire at the same instant (a scheduler, a page load, a manual button) and must resolve to one computation, not racing writes"
  - "The compute reads inputs and writes derived rows that must land atomically with a 'done' marker, on Postgres via an interactive transaction (Prisma or similar)"
tags:
  - advisory-lock
  - write-once
  - idempotency
  - single-winner
  - transaction-isolation
  - read-committed
  - postgres
  - concurrency
related_components:
  - service_object
  - database
---

# Write-once atomic compute under a per-key advisory lock

## Context

Some computations must happen **exactly once** and then be frozen forever: draw the
groups, settle the invoice, allocate the seats. Two failure modes make this hard the
moment more than one thing can trigger it:

1. **Concurrent triggers.** At the boundary instant, a scheduler, a visitor's page
   load, and a manual "run it now" can all fire together. If each independently checks
   "not done yet?" and then computes, several of them pass the check before any writes,
   and you get **multiple divergent results** — duplicate rows, people assigned twice.
2. **Partial writes.** The compute writes several derived rows _and_ a "done" marker. If
   those don't commit as one unit, a reader can see rows without the marker (looks
   unfrozen, triggers a recompute) or the marker without rows (looks empty).

This pattern was extracted from the Day-of-Prayer **pairing freeze** (issue #21, PR #40,
unmerged as of this writing): at the reveal instant, submissions are shuffled into groups
and `Session.pairingFrozenAt` is stamped — once, permanently — even though a cron nudge, a
participant's reveal-page load, and the organizer could all trigger it in the same second.
It is the write-side companion to [server-authoritative time gating](./server-authoritative-time-gating.md),
which owns _when_ the boundary is; this owns _committing the result at_ the boundary.

## Guidance

Run the whole thing inside **one interactive transaction** that opens with a
**per-key advisory lock**, and pin the isolation level so the lock is actually a
single-winner. Five moving parts:

**1. Take a session-scoped advisory lock as the first statement.** A Postgres _advisory
lock_ is an application-defined lock keyed by a number you choose — it guards a logical
operation, not a row. Derive a stable 64-bit key from the entity id so different keys
never block each other, and use the transaction-scoped variant so it auto-releases on
commit or rollback:

```ts
// src/lib/repository.ts:365 — first statement inside client.$transaction(...)
await tx.$queryRaw`SELECT pg_advisory_xact_lock(
  hashtextextended(${sessionId}, ${PAIRING_LOCK_SEED}::bigint))`;
```

Concurrent triggers for the same key queue here; the winner proceeds, the rest block.

**2. Re-check the "done" marker after acquiring the lock, and short-circuit.** The loser
unblocks _after_ the winner commits, reads the now-set marker, and returns the existing
result without recomputing:

```ts
// src/lib/repository.ts:380
if (session.pairingFrozenAt) {
  const groupCount = await tx.group.count({ where: { sessionId } });
  return {
    status: "frozen",
    frozenAt: session.pairingFrozenAt,
    alreadyFrozen: true,
    groupCount,
  };
}
```

**3. Pin the isolation level to Read Committed — the lock alone is not enough.** For the
loser's re-check in step 2 to _see_ the winner's commit, its `SELECT` must take a fresh
snapshot. Under Read Committed (Postgres' default) each statement does. Under Repeatable
Read or Serializable the loser's snapshot is frozen at transaction start — it would miss
the commit, conclude "not done," and recompute, producing duplicates. So the level is
pinned explicitly, not left to the datasource default. Pin the transaction's
`timeout`/`maxWait` in the same options object too: the loser's lock-wait is charged
against the transaction timeout, so relying on the driver's silent default risks a queued
trigger aborting mid-wait instead of reading the frozen result — bound it deliberately:

```ts
// src/lib/repository.ts:446 — the $transaction options argument
{
  isolationLevel: "ReadCommitted",
  timeout: PAIRING_FREEZE_TIMEOUT_MS, // lock-wait + work share this budget
  maxWait: PAIRING_FREEZE_MAX_WAIT_MS, // wait for a free pool connection
}
```

**4. Write the derived rows in one statement, then stamp the marker last.** Ordering the
"done" marker as the final write means rows and marker commit together — no observer ever
sees one without the other:

```ts
// src/lib/repository.ts:417 — one INSERT for the whole result set
if (groups.length > 0) {
  await tx.group.createMany({
    data: groups.map((memberSubmissionIds) => ({
      sessionId,
      memberSubmissionIds,
    })),
  });
}
// src/lib/repository.ts:430 — stamp LAST, same transaction
await tx.session.update({
  where: { id: sessionId },
  data: { pairingFrozenAt: now },
});
```

**5. Keep the pure logic out of the transaction.** The actual algorithm (shuffle, pair)
is a pure function with no database imports, so it unit-tests on plain arrays and the
transactional shell stays thin. This also keeps a privacy boundary intact: the compute
reads only the ids it needs, never sensitive columns.

```ts
// src/lib/pairing.ts:50 — pure; the transaction calls it with already-read ids
export function formGroups<T>(shuffledMembers: readonly T[]): T[][] {
  /* ... */
}
```

## Why This Matters

- **Single-winner is structural, not hopeful.** The advisory lock serializes the racing
  triggers on one pinned connection; the post-lock re-check turns every loser into a
  reader. Correctness does not depend on a unique constraint or on triggers being polite.
- **Read Committed is load-bearing, so it is pinned.** The subtle bug is a _stricter_
  isolation level silently breaking the guarantee — the loser recomputing off a stale
  snapshot. Naming the level in code documents the dependency and stops a future "let's
  make everything Serializable" change from reintroducing double-compute.
- **Atomic all-or-nothing.** Rows + marker in one transaction means a mid-way failure
  rolls back cleanly (no marker, no rows) and a retry recomputes from scratch. The
  create-then-stamp order guarantees no torn intermediate state is ever visible.
- **Testable and private.** The pure/transaction split lets the algorithm's invariants be
  asserted without a database, and confines all raw data access — and any sensitive-column
  exposure risk — to the one module that owns the boundary.

## When to Apply

- A per-key operation must run **once** and its output frozen: matchmaking, draws,
  settlements, allocations, "close the books."
- Multiple uncoordinated triggers can reach it at the boundary and you need exactly one
  computation.
- You are on Postgres with interactive transactions (Prisma `$transaction`, or equivalent)
  and can issue `pg_advisory_xact_lock`.

**When not to:** a single serialized trigger (one cron, no other callers) may only need a
conditional `UPDATE ... WHERE marker IS NULL` and no lock. If the derived rows carry a
natural unique constraint, that constraint can be the single-winner mechanism instead of
an advisory lock — but note it won't help when rows are written _before_ the marker (as
here), since two lock-less winners would both pass the null-check and both insert.

## Examples

**Before — check-then-act with no lock (two triggers both compute):**

```ts
// Trigger A and Trigger B both run this concurrently:
const s = await db.session.findUnique({
  where: { id },
  select: { pairingFrozenAt: true },
});
if (s.pairingFrozenAt) return existing; // both read null — both fall through
const groups = pair(await readSubmissions(id)); // both compute a DIFFERENT shuffle
await db.group.createMany({ data: groups }); // duplicate group sets written
await db.session.update({
  where: { id },
  data: { pairingFrozenAt: new Date() },
});
```

**After — advisory lock + Read Committed + create-then-stamp (exactly one winner):**

```ts
return client.$transaction(
  async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, ${SEED}::bigint))`;
    const s = await tx.session.findUnique({
      where: { id },
      select: { revealAt: true, pairingFrozenAt: true },
    });
    if (s.pairingFrozenAt) return readBack(tx, id); // loser reads the winner's result
    const groups = formGroups(shuffle(await readIds(tx, id)));
    if (groups.length > 0)
      await tx.group.createMany({ data: rows(groups, id) });
    await tx.session.update({ where: { id }, data: { pairingFrozenAt: now } }); // stamp last
    return { frozen: true, groupCount: groups.length };
  },
  { isolationLevel: "ReadCommitted" },
);
```

The loser blocks at the lock, then — because Read Committed gives it a fresh snapshot —
sees `pairingFrozenAt` set and returns the existing result. One compute, ever.

## Related

- Issue #21 (Pairing algorithm + write-once freeze) and PR #40 — the originating change.
- [`server-authoritative-time-gating.md`](./server-authoritative-time-gating.md) — the
  companion pattern: the app clock owns _when_ the boundary is (issue #20), this owns
  _committing the result at_ it. Both read the same `isBeforeReveal` predicate
  (`src/lib/submit.ts`), which the freeze reuses to refuse an early trigger
  (`src/lib/repository.ts:378`).
- `src/lib/pairing.ts` — the pure `formGroups` / `shuffle` algorithm (unit-tested on arrays).
- `src/lib/repository.ts` — `freezePairing`, the transactional shell inside the sanctioned
  data-access layer.
- `CONCEPTS.md` — _Pairing_, _Pairing freeze_, _Group_.
