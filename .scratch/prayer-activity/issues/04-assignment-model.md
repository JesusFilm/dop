# Assignment model

Type: grilling
Status: open
Blocked by: 01

## Question

Lock the algorithm and its edge behavior so it provably meets: everyone prayed for exactly once, randomized, no self-assignment, no one missed, no doubles.

- **Confirm the mechanic**: a single random cycle (cyclic derangement) — shuffle participants into a random order, each prays for the next, last wraps to the first. This guarantees every person prays for exactly one other and is prayed for by exactly one other, with no fixed points. Is one-directional (you see who to pray for) enough, or should someone also be told they're being prayed for?
- **Reveal mechanism** (surfaced by ticket 03): the user chose "automatic at a set time", but the recommended free stack (Vercel Hobby) only offers once-daily, ±59-min cron — so an **organizer-triggered on-demand reveal** is the natural fit and is also more robust to late arrivals. Reconcile: keep an auto time, switch to a one-button organizer trigger, or both (auto with a manual fallback)?
- **Late arrivals** (the fixed-reveal weak spot): what happens to people who submit *after* the automatic reveal time? Options to weigh — (a) hard cutoff, late submissions not included; (b) periodic re-assignment / rolling cycles; (c) append late-comers by splicing into the existing cycle. Pick one that keeps the exactly-once guarantee.
- **Edge cases**: n = 0, n = 1 (no one to pray for — what do they see?), n = 2 (the only valid derangement is mutual).
- **Determinism / re-runs**: is the assignment computed once and frozen, or recomputable? What if someone submits twice / duplicates a name?

Use domain-modeling to state the model precisely (types + invariants) so the build spec is unambiguous.
