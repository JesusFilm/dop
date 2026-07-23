# Wayfinder map: Prayer Activity — QR prayer-request matcher

Label: `wayfinder:map`

## Destination

A **locked, buildable spec + build plan** for a lightweight event app: people scan a QR code, submit their name + a personal prayer request (with a gentle prompt), and are told to come back later. At a set time an automatic, randomized assignment guarantees **every person is prayed for exactly once** by another person — no doubles, no one missed, no self-assignment. Returning on the **same phone** (cookie/link), each person sees who they've been assigned to pray for and reads that request. Deliverable is the spec + a ticket plan someone can build from before **Monday 2026-07-27** — not the running app itself.

## Notes

- Domain: a one-day, in-person organizational "day of prayer". Sensitive, personal content. Warmth and low friction matter more than features.
- Mode: **plan, don't do** (default). Destination is a spec + build plan, not a deployed app. Actual building/deploying is Out of scope for this effort.
- Core mechanic already recognized: a **single random cycle (cyclic derangement)** — shuffle everyone into a random order, each prays for the next, last wraps to first. Guarantees exactly-once coverage in both directions with no self-pray. Validate this framing in the assignment ticket.
- Known weak spot to resolve: reveal is "automatic at a set time" → **late arrivals** who submit after the reveal need a defined policy.
- Retrieval decided: **same-phone cookie/link** (no login). Cross-device fallback is an open sub-question.
- Stack decided in principle: **a zero-config host chosen for the user**; specifics land via the stack research + decision.
- Consult skills: `/research` (stack), `/prototype` (form copy, return flow), grilling/domain-modeling for decision tickets.

## Decisions so far

<!-- one line per resolved ticket: gist + link -->

- [Zero-config stack survey](issues/03-stack-survey.md) — recommend **Next.js on Vercel + Neon Postgres (both free)**, assignment run as an **on-demand protected admin endpoint** (not cron); runner-up Cloudflare Pages+Workers+D1. Full findings on branch `research/stack-survey`.

## Not yet specified

- **Assemble the spec + build plan** (the destination artifact) — a `task` to write `.scratch/prayer-activity/spec.md` once the decisions below are made. Graduates near the end.
- **Cross-device / cleared-cookie fallback** for retrieval — how a returning person recovers their assignment if the cookie is gone. May graduate out of the return-flow ticket, or be consciously accepted as a limitation.
- **Organizer / operational runbook** — what the organizer does on the day (display QR, monitor submissions, what if the auto-reveal misfires). Sharpen after logistics + assignment are settled.

## Out of scope

- **Building and deploying the actual app** — destination is a spec + build plan; execution happens after, as separate work.
- **Post-event features** (thank-you notes, follow-up, analytics) — not part of the Monday event.
