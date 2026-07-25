---
title: Server-authoritative time gating with a clock-skew-proof client countdown
date: 2026-07-25
last_updated: 2026-07-25
category: docs/solutions/design-patterns
module: Reveal timing (Day of Prayer)
problem_type: design_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - "A feature must flip state at one exact deadline (a reveal, an unlock, a close) and the sharpness must not depend on a background scheduler"
  - "A countdown to that deadline is shown to clients whose device clocks cannot be trusted"
  - "The stack is Next.js App Router (server components + a client component) or any server-rendered app with a client ticker"
  - "A new surface is added behind a time gate that already exists elsewhere — liveness does not travel with the predicate"
tags:
  - app-clock
  - time-gating
  - countdown
  - clock-skew
  - server-authoritative
  - nextjs
  - react
related_components:
  - "Next.js App Router server components"
  - "React client components"
---

# Server-authoritative time gating with a clock-skew-proof client countdown

## Context

A feature often has to switch behavior at **one exact instant** — submissions close, a
reveal opens, a sale ends. Two forces make this deceptively hard:

1. **The trigger drifts.** Whatever fires the switch (a cron job, a scheduler, a queue)
   is usually best-effort and can run minutes late. If "it's time" means "the scheduler
   fired," the boundary is as fuzzy as the scheduler.
2. **The client clock lies.** A countdown rendered on the user's device, comparing _their_
   wall clock to the deadline, shows the wrong number when the device clock is wrong — and
   can "reach zero" early or late, unlocking content out from under the server.

This pattern was extracted from the Day-of-Prayer reveal (issue #20, PR #38, merged), where a
room of ~100 phones must all flip from "submit your request" to
"here's who you're praying for" at the organizer-set reveal time, on venue wifi, regardless
of cron drift.

**A second surface proved the pattern is per-surface, not per-predicate** (issue #19, PR #43,
unmerged as of this writing). The confirmation screen `src/app/confirmed/page.tsx` carried the
server gate faithfully — `redirect("/")` once `isRevealOpen` — but nothing else, and a
server-side gate only runs when a request reaches the server. That page is precisely the one
nobody sends a request from: it is where a participant lands right after submitting, and its
own copy tells them to _stay_ ("Come back to this page after the reveal time…",
`src/lib/confirmation.ts:42-47`). Left open at 10:59, it still read "come back after 11:00" at
11:05. The gate was correct; only its liveness was missing. Copying the predicate to a new page
buys correctness for free and liveness not at all.

## Guidance

Make the **application's own clock the single authority** for the boundary, and give the
client a countdown that is anchored to server time, never to the device clock.

**1. Define the boundary once, as a pure predicate.** One instant (`revealAt`) is the whole
gate. Express "is it open yet?" as the exact logical complement of "is it still before?", and
_derive_ one from the other so they can never drift apart:

```ts
// src/lib/submit.ts:161 — the one boundary definition (strict <)
export function isBeforeReveal(now: Date, revealAt: Date): boolean {
  return now.getTime() < revealAt.getTime();
}

// src/lib/reveal.ts:23 — the reveal gate, defined in terms of the above
export function isRevealOpen(now: Date, revealAt: Date): boolean {
  return !isBeforeReveal(now, revealAt);
}
```

Because `isBeforeReveal` is strict (`<`), the boundary is **inclusive on the open side**:
at the exact instant `now === revealAt`, submissions are closed _and_ the reveal is open
("close = reveal"). Both the submit cutoff and the reveal gate read from the same predicate,
so they cannot disagree.

**2. Gate on the server, read the clock once.** The server component reads `new Date()` a
single time and derives every branch — and the countdown's anchor — from that one reading:

```tsx
// src/app/page.tsx
const now = new Date();
const revealOpen = isRevealOpen(now, session.revealAt);
// ...
<Countdown initialRemainingMs={msUntilReveal(now, session.revealAt)} />;
```

`msUntilReveal` clamps at zero so the client never receives a negative anchor
(`src/lib/reveal.ts:33`).

**3. Hand the client a duration, not a deadline; tick down elapsed monotonic time.** The
client seeds its countdown from the server-computed remaining milliseconds, then subtracts
_elapsed_ time measured with `performance.now()` — a monotonic timer immune to the device
clock being wrong or adjusted mid-countdown:

```tsx
// src/app/Countdown.tsx (abridged)
const startedAt = performance.now(); // monotonic anchor
function tick() {
  const elapsed = performance.now() - startedAt;
  const next = Math.max(0, initialRemainingMs - elapsed);
  setRemainingMs(next);
  // ...at zero, ask the server (see step 4)
}
```

A phone set three hours fast still shows the correct countdown, because only the _duration_
since page load matters, and durations don't care what time the device thinks it is.

**4. At zero, ask the server to re-render — don't unlock client-side.** When the countdown
hits zero the client calls `router.refresh()` rather than revealing content itself. The
server re-reads its own clock, re-evaluates `isRevealOpen`, and decides what to serve. The
client only _asks_; the app clock _answers_. This is what stops a fast client clock from
jumping the gate.

"What to serve" includes **sending the user somewhere else**, not just different content at
the same URL. A `redirect()` thrown during a refresh-triggered RSC render is followed by the
client: the server turns the redirect error into a real HTTP redirect
(`res.statusCode = getRedirectStatusCodeFromError(err)` plus a `location` header,
`node_modules/next/dist/server/app-render/app-render.js:1406-1417`), the RSC fetch follows it by default and
returns the final URL as `canonicalUrl`
(`node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:106-107`), and the refresh
reducer adopts it (`node_modules/next/dist/client/components/router-reducer/reducers/refresh-reducer.js:70-72`). So a redirect-shaped gate is just
as re-gateable as a render-in-place one — `/confirmed` moves its occupant to `/` at the
boundary with no interaction. Verified against Next 15.5.21 as installed.

**5. Retry the "ask" so a lost round-trip can't freeze the screen.** The reveal moment is
exactly when every client hits the network at once. Keep the ticker running past zero and
re-attempt `router.refresh()` on a slow cadence until one succeeds — a success serves the
gated view and unmounts the component, whose effect cleanup stops the retries:

```tsx
let lastRefreshAt = Number.NEGATIVE_INFINITY; // first zero-crossing fires immediately
if (next <= 0 && elapsed - lastRefreshAt >= REVEAL_REFRESH_RETRY_MS) {
  lastRefreshAt = elapsed;
  router.refresh();
}
```

**Know what the retry does and does not cover.** It rescues a refresh that _succeeds_ but still
returns pre-reveal content — a slow or stale round-trip. It does not rescue a **failed** one:
when the response is not a flight response, is not OK, or has no body, Next abandons the soft
refresh and performs a full document navigation instead
(`if (!isFlightResponse || !res.ok || !res.body) { return doMpaNavigation(...) }`,
`node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:121-129`). A thrown fetch —
the phone is simply offline — converges on the very same branch: the `catch` returns a string
`flightData`
(`node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:151-160`),
which the reducer routes to `handleExternalUrl`
(`node_modules/next/dist/client/components/router-reducer/reducers/refresh-reducer.js:48-49`) —
the same exit `doMpaNavigation` takes. So the failure mode
at the boundary is a hard page load, not a frozen `0:00`: online that is a reload nobody
notices, offline it is the browser's error page replacing whatever the screen was showing.
Weigh that where the gated screen holds something irreplaceable — `/confirmed` displays a
recovery code the participant may not have screenshotted yet.

> Note: `src/app/Countdown.tsx` used to overstate this in two places — its docstring and the
> inline comment at the refresh call both implied a failed round-trip was re-attempted rather
> than left frozen. The retry is real, but per the source above a hard failure navigates away
> instead of waiting to be retried. Both comments now scope the retry to the stale-response
> case (PR #43).

## Why This Matters

- **Sharpness is decoupled from the scheduler.** The scheduler becomes a mere _compute
  nudge_; whether it's reveal time is always `now >= revealAt` on the server. Cron can drift
  minutes and the boundary stays exact.
- **The countdown can't be gamed or broken by a wrong device clock.** Anchoring to a
  server-computed duration + monotonic elapsed time removes the client clock from the trust
  path entirely — for both correctness (step 4 gates on the server) and display (step 3).
- **One predicate = no contradictory states.** Deriving `isRevealOpen` from `isBeforeReveal`
  means a "submissions closed but reveal not open" gap is structurally impossible.
- **Graceful under real network conditions.** Without the retry (step 5), a stale round-trip
  strands the user on `0:00` until a manual reload — worst at the exact moment of peak load.
  The retry turns that into a few-seconds catch-up. A _hard_ failure is caught by a coarser
  net underneath: the framework escalates to a full document load, which recovers the user at
  the cost of whatever the screen was showing.
- **The gate's correctness and the gate's liveness are separate properties.** A new surface
  inherits the first by importing the predicate and the second only by re-asking. The screens
  most likely to be parked on are exactly the ones that _tell_ users to park — so the more
  explicitly a page promises "come back at 11:00", the more certain it is to be the page open
  at 11:00, and the louder its self-contradiction.

## When to Apply

- One hard deadline must be enforced sharply and independently of a background trigger.
- A live countdown is shown to clients you don't control (phones, kiosks) with untrusted clocks.
- The reveal/unlock decision must remain the server's, even while a client displays progress
  toward it.
- **Any new surface goes behind an existing gate** — especially a natural terminus (a
  confirmation, a receipt, a "you're all set" screen) that users reach and stop navigating
  from, or one whose copy names the boundary instant. The review question is one line:
  _what does this screen show if someone simply leaves it open at 11:00?_ If the answer is
  "the same thing it showed at 10:59", the surface is missing its re-gate.

**When not to:** if the deadline is soft (approximate is fine), or there is no server round-trip
available at zero (a fully static/offline page), the round-trip-at-zero step doesn't apply —
fall back to displaying the deadline and letting the next natural navigation re-gate.

## Examples

**Before — naive client countdown (broken by clock skew):**

```tsx
// Compares the DEVICE clock to the deadline every tick.
const remaining = revealAtMs - Date.now(); // wrong if the phone clock is wrong
if (remaining <= 0) showRevealView(); // client unlocks itself — a fast clock jumps the gate
```

**After — server-anchored duration + monotonic tick + server re-gate:**

```tsx
// Server: const initialRemainingMs = msUntilReveal(new Date(), session.revealAt)
// Client:
const startedAt = performance.now();
const next = Math.max(0, initialRemainingMs - (performance.now() - startedAt));
if (next <= 0) router.refresh(); // ask the server; it owns the gate
```

The display value now survives any device-clock error, and the actual state change is always
the server's call.

## Related

- Issue #20 (App-clock gating + hard cutoff) and PR #38 (merged) — the originating change.
- Issue #19 (Confirmation + recovery code) and PR #43 — the second surface, which added the
  re-gate to `src/app/confirmed/page.tsx` and established the redirect and failed-refresh
  behavior documented in steps 4 and 5.
- `src/app/page.tsx` and `src/app/confirmed/page.tsx` — the two call sites of the pattern.
- `src/app/Countdown.tsx` — the shared re-gate component; its comments scope the retry to the
  stale-response case (step 5).
- `src/lib/reveal.ts` — `isRevealOpen`, `msUntilReveal`, `formatCountdown` (pure, unit-tested).
- `src/lib/submit.ts` — `isBeforeReveal`, the single boundary definition also used by the
  server-side submit/edit hard cutoff (`src/app/actions.ts`).
- `CONCEPTS.md` — _Reveal time_, _App-clock authority_, _Hard cutoff_.
