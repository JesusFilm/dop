---
title: An empty result must not claim a cause it cannot prove
date: 2026-07-25
category: docs/solutions/design-patterns
module: Return view (Day of Prayer)
problem_type: design_pattern
component: service_object
severity: medium
applies_when:
  - "A state machine picks a user-facing screen, and one of its states is chosen by a derived collection being empty (no partner, no results, no matches, no charges)"
  - "The copy for that state explains WHY it is empty — the screen asserts a cause, not just an absence"
  - "The same empty value has more than one cause: the computation has not run, it ran and legitimately produced nothing, or it ran and left this caller out"
  - "Two clocks (an app process and the database, or a client and a server) sit on either side of one cutoff, so 'accepted' and 'included in the derived result' can disagree for a last-instant write"
  - "Distinguishing the causes needs an extra read, and the branch that needs it is the rare path of a high-traffic moment"
related_components:
  - "database"
  - "documentation"
tags:
  - "state-machine"
  - "empty-state"
  - "user-facing-copy"
  - "honest-errors"
  - "clock-skew"
  - "derived-data"
  - "privacy-boundary"
  - "pure-functions"
---

# An empty result must not claim a cause it cannot prove

## Context

A screen or an API endpoint reports on a **derived collection** — the group you were
matched into, the seats you were allocated, the results for your query. When that
collection comes back empty, there is a strong pull to explain the emptiness, because
"nothing here" is a bad answer and product copy hates bad answers.

The pull is a trap. **An empty derived collection cannot tell you why it is empty.**
`count === 0` is the same value whether the upstream computation has not run, ran and
legitimately produced nothing for you, or ran and produced plenty while skipping you.
Reporting one of those as the cause is a coin flip that the system delivers in a
confident voice.

This was extracted from the Day-of-Prayer participant return view (issue #23, PR #42,
**open and unmerged as of this writing**), which sits on top of the pairing freeze
(issue #21, PR #40) and the confirmation screen (issue #19, PR #43). The post-reveal
screen is chosen by a pure state machine, `selectReturnState`
(`src/lib/return-view.ts`), from a few booleans plus a partner count. "No partner"
has **three** causes, not one:

1. the pairing has not run yet — a seconds-long wait at the reveal instant;
2. the pairing ran and produced no groups at all, because theirs was the only
   submission — genuinely alone (spec §4 small-n: `n=1` → "not enough people");
3. the pairing ran, paired the room, and left this one entry out — shouldn't happen,
   but is reachable.

The code collapsed 2 and 3 into a single ternary — `return inputs.pairingFrozen ?
"lone" : "pending-freeze"` — and the `lone` copy asserted a cause:
_"Yours was the only request in when we closed, so there was no one to pair you with."_
For case 3 that is a flat lie told to someone standing in a room full of people
comparing partner cards. It is the worst shape of bug: not a crash, not a blank
screen, but a wrong explanation delivered fluently.

**Why case 3 exists is worth its own paragraph, because it generalises.** The freeze
selects eligible submissions with `where: { sessionId, createdAt: { lt: session.revealAt } }`
(`src/lib/repository.ts`), where `createdAt` is stamped by Postgres
(`@default(now())`, `prisma/schema.prisma`). The submit cutoff that _admitted_ the
entry compared the Node app-process clock: `isBeforeReveal(new Date(), session.revealAt)`
(`src/app/actions.ts`, and again for edits). An admission gate and a downstream
eligibility filter that look like they compare "the same instant" are reading **two
different clocks**, with write latency sitting between them. A last-second entry can
therefore be admitted by one and excluded by the other. Any time an upstream gate and a
downstream filter derive their timestamps from different sources, the set they agree on
is smaller than either believes.

Three details make that window real rather than theoretical, and they are the reason
this doc exists at all:

- **There is no buffer between close and reveal.** Ticket #14 locked submissions closing
  and the pairing becoming visible as _one_ instant ("close = reveal"), so there is no
  quiet gap in which a straggler write could land safely (session history).
- **The `createdAt` eligibility filter was never a decision.** Searching the build
  sessions for #14, #20, #21 and #22 turns up careful reasoning about the freeze's
  _commit_ semantics — single-winner, advisory lock, atomic stamping — and no discussion
  at all of which clock should decide _eligibility_. The database stamp was incidental
  (session history).
- **It had already been found once and deferred.** A review pass during issue #22 raised
  the same `createdAt`-versus-app-clock mismatch, triaged it as a design decision rather
  than a patch, and it was left unresolved when that work was set aside (session
  history). Being rediscovered from the opposite direction — as a lie on a screen rather
  than a filter in a query — is the strongest argument for writing it down.

## Guidance

**Never let emptiness stand in for a cause — in code or in copy. Take the upstream
producer's completion marker as its own explicit input, and enumerate every way the
collection could be empty.**

**1. Make the marker a named input, not an inference.** The state machine gained
`sessionHasGroups` alongside `partnerCount`, and the branch became a straight
enumeration:

```ts
// src/lib/return-view.ts
if (!inputs.pairingFrozen) {
  return "pending-freeze"; // the pairing hasn't run — waiting is not alone
}
return inputs.sessionHasGroups ? "unpaired" : "lone";
```

Three causes, three states. Note the ordering: `pairingFrozen` is checked _first_, so
`sessionHasGroups` is meaningless-and-ignored before the freeze rather than able to drag
a waiting participant into a wrong terminal state.

**2. Give the unknown cause its own state, and let its copy claim nothing.** The new
`unpaired` state says what happened, refuses to say why, closes the privacy question the
participant will actually be worried about, and hands them to a person:

> "Something went wrong matching you this time — this isn't your fault, and your request
> wasn't seen by anyone else. Find an organizer and they'll pair you up in the room."

Meanwhile `lone` keeps its causal claim, because it is now reached _only_ when the freeze
produced no groups whatsoever — the one branch where the cause is known.

**3. The _shape_ of the marker decides whether reading it is even allowed.** The input
comes from a new `countGroups` — a bare `client.group.count({ where: { sessionId } })` —
never membership, never request content. That is what keeps it inside this project's
Privacy #3 boundary (requests retrievable only per-group). Fetching the groups to see
whether any exist would have answered the same question and breached the boundary on the
way. When you reach for a completion marker, reach for the smallest one that
distinguishes the cases.

**4. Read the marker only in the branch that consults it.** The count is fetched inside
the narrow condition that needs it (`src/app/page.tsx`): reveal open, an entry present,
pairing frozen, and no partners. The reveal instant is a thundering herd — every phone in
the room re-rendering at once — and the common paths must not pay for a query they never
look at.

**5. Adding a state is the moment to check the consumer is exhaustive.** The seventh state
exposed that the consuming `switch` had no `default`, so a future eighth state would have
fallen out of a server component as `undefined` — a blank screen at the reveal.
`tsconfig.json` sets no `noImplicitReturns`, and `eslint.config.mjs` enables no
exhaustiveness rule, so neither tool would have said anything. The guard makes the
omission a compile error:

```ts
default: {
  const unhandled: never = state;
  throw new Error(`Unhandled return-view state: ${String(unhandled)}`);
}
```

Verified by temporarily adding an eighth state to the union and running `tsc --noEmit`,
which failed at the `default` branch with `error TS2322: Type '"probe-only"' is not
assignable to type 'never'` — then reverting the probe. Re-run that way if you ever need to
confirm the guard still bites; a passing typecheck with all cases present is itself the
proof that the union is fully handled.

**6. Unit-test the truth table, especially the rows that look identical.** The two
`partnerCount: 0` cases that must resolve differently are asserted explicitly, as is the
rule that `sessionHasGroups` is ignored before the freeze. The copy is tested in both
directions too: `loneBody` must match `/only request/i`, and `unpairedBody` must **not**
match `/only|alone|no one else/i` — a lint against re-introducing the lie by sympathetic
rewording.

## Why This Matters

- **A confident wrong explanation is worse than no explanation.** A blank screen makes the
  user ask someone; "you were the only one" makes them believe the room and walk away. The
  failure is invisible in logs and reported by nobody, because the system sounded certain.
- **The marker is information the count structurally cannot hold.** No amount of care in
  reading `partnerCount` recovers _why_ it is zero; only an input from the producer does.
  Passing it explicitly makes the missing information a signature change rather than a
  comment.
- **Two clocks look like one clock.** The gap between `new Date()` in the app process and
  `now()` in Postgres is small, invisible in review, and exactly the width of the boundary
  case users hit — the last-second submitter.
- **Cheap markers keep privacy boundaries intact.** A count crosses the boundary where the
  collection itself would not. Choosing the marker's shape deliberately is a privacy
  decision, not a performance one.
- **Enumerating causes ratchets.** Once the branch is an enumeration rather than a ternary,
  adding a fourth cause is a compile error at the consumer instead of a silently
  mis-attributed screen.
- **This failure shape recurs on this surface.** An earlier pass on the same page shipped
  post-reveal copy telling participants to "come back after the reveal time" from a branch
  that only runs once the reveal is already open; review caught it and it was replaced with
  an interim placeholder (session history). Copy that contradicts the state it renders in
  is a category of bug on this screen, not a one-off.

**What this does not fix.** Splitting the states makes the _reporting_ honest; it does not
close the two-clock window. An entry can still be admitted and then excluded — the
participant now gets truthful copy and an organizer instead of a lie. Narrowing the window
itself (a settle margin, or filtering eligibility on the same clock that admitted the
entry) remains an open design question, and the same question was already parked once
during issue #22 (session history).

## When to Apply

- A UI or API reports on a derived collection produced by an **asynchronous or one-shot
  upstream computation**: a match, a draw, a settlement, an allocation, a batch job, a
  search-index build.
- Emptiness has more than one possible cause, and at least one of them is "the producer
  hasn't finished" or "the producer skipped you."
- The user-facing copy is about to name a cause. That is the trigger. Ask: _which input
  proves this?_ If the answer is "the collection is empty", the copy is guessing.
- An upstream admission gate and a downstream eligibility filter read timestamps from
  different sources (app process vs database, two services, two regions). Assume their
  agreement is imperfect and give the disagreement a state.
- A state union grows: check the consumer for a `default: never` guard, since neither
  `tsc` (without `noImplicitReturns`) nor a default lint config will flag the omission.

**When not to:** if emptiness has exactly one possible cause — a synchronous computation in
the same request, or a collection that is empty only when its input was empty — an extra
input is ceremony. The same applies when the honest answer is already the only answer you'd
show: if every cause routes to "find an organizer", a single state with causeless copy is
correct and cheaper than a marker you never branch on.

## Examples

**Before — one boolean, two causes, one of them asserted as fact:**

```ts
// partnerCount === 0 at this point. Why? The code doesn't know, and says so anyway.
return inputs.pairingFrozen ? "lone" : "pending-freeze";
// → "Yours was the only request in when we closed, so there was no one to pair you with."
```

**After — the producer's marker as an explicit input, causes enumerated:**

```ts
// src/lib/return-view.ts
if (!inputs.pairingFrozen) return "pending-freeze"; // hasn't run
return inputs.sessionHasGroups
  ? "unpaired" // ran, paired the room, left this entry out — cause unknown, so unclaimed
  : "lone"; // ran, produced nothing at all — the cause IS known (§4 n=1)
```

**And the marker, read narrowly and shaped for the privacy boundary:**

```ts
// src/app/page.tsx — only the one branch that consults it pays for the query
const sessionHasGroups =
  revealOpen && existing !== null && pairingFrozen && partners.length === 0
    ? (await countGroups(db, session.id)) > 0
    : false;
```

## Related

- Issue #23 (Return view) and PR #42 — the originating change, open and unmerged as of
  this writing.
- [`write-once-atomic-compute-under-a-session-lock.md`](./write-once-atomic-compute-under-a-session-lock.md)
  — the producer whose completion marker this pattern consumes (issue #21, PR #40). That
  doc names the reader hazard ("the marker without rows — looks empty"); this is the
  read-side rule for it.
- [`server-authoritative-time-gating.md`](./server-authoritative-time-gating.md) — the app
  clock that admits the submission; the two-clock gap above is the seam between it and the
  freeze's `createdAt` filter.
- [`destructive-jobs-must-name-their-target.md`](./destructive-jobs-must-name-their-target.md)
  — the same ambiguity in operator tooling: output that reads identically whether the job
  did its work or was pointed at the wrong database.
- Issue #22 (Reveal triggers) — still open, and the reason `pending-freeze` currently has
  no producer: nothing in the repository fires the freeze yet.
- `src/lib/return-view.ts` — `selectReturnState`, the state union, and the locked copy
  (`lone` vs `unpaired`).
- `src/lib/repository.ts` — `countGroups` (bare count, Privacy #3) and the freeze's
  `createdAt` eligibility filter.
- `src/app/page.tsx` — the narrow marker read and the `default: never` exhaustiveness guard.
- `src/lib/return-view.test.ts` — the truth table, including the two same-`partnerCount`
  rows and the copy assertions.
- `docs/prayer-activity-spec.md` §4 (assignment + small-n), §5 (reveal timing), §7.3
  (return view); `CONCEPTS.md` — _Pairing freeze_, _Group_.
