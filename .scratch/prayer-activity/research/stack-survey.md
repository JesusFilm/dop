# Zero-config stack survey — QR prayer-request matcher

Research for ticket `.scratch/prayer-activity/issues/03-stack-survey.md`.
Investigated against primary sources (official docs / pricing pages), 2026-07-23.
All free-tier numbers are quoted from the vendor's own docs; citations inline.

## What the app actually needs (the shape that decides the winner)

This is a small but genuinely **full-stack, dynamic** app, not a form:

1. **Public HTTPS page** reachable by QR (a mobile-friendly submit page).
2. **Persist** each submission (name + free-text request).
3. **One assignment computation** — a single random cyclic derangement over all
   submissions (see map.md), run once at/after a set reveal time.
4. **Per-person "return view"** keyed off a **same-phone cookie / localStorage**
   (no login) — i.e. a personalized, per-visitor server response.
5. **Free / near-free**, minimal accounts, reasonable posture for sensitive
   personal (prayer) content.

Scale is tiny: at most a few hundred rows, one batch job, low concurrency. So
**free-tier throughput limits are never the constraint** — the deciding factors
are *setup effort*, *how the one job is triggered*, whether a personalized
dynamic page is natural, and *how many third parties touch sensitive text*.

Key consequence for scheduling: because there is exactly **one** job at a known
time, an **on-demand endpoint the organizer hits at reveal time** (or a button in
an admin page) is more reliable than any cron — it sidesteps free-tier cron
imprecision entirely. Cron availability is a nice-to-have, not a requirement.

## Candidates

### 1. Next.js on Vercel + hosted Postgres (Neon / Supabase) — RECOMMENDED

- **Setup effort:** Lowest for anyone even slightly dev-adjacent. `git push` →
  automatic build, automatic HTTPS URL for the QR, preview + prod deploys. No CI
  to configure. Cookies/localStorage and personalized server responses are
  first-class in Next (route handlers + `cookies()`), so the return-view
  requirement is trivial.
- **Scheduling story:** Best implemented as an **on-demand protected endpoint**
  (organizer opens a secret URL / clicks admin button at reveal time). Vercel
  *does* have Cron Jobs, but on the **Hobby (free)** plan they are limited to
  **once per day** with **per-hour (±59 min) precision** — "a cron job configured
  as `0 1 * * *` will trigger anywhere between 1:00 am and 1:59 am"
  (vercel.com/docs/cron-jobs/usage-and-pricing). That imprecision is unusable for
  a "reveal at a set time" moment, so use the manual endpoint instead. Cron here
  is a fallback, not the mechanism.
- **Data-model fit:** Real relational DB → a `submissions` table and an
  `assignments` table (or an `assigned_to` FK) model the derangement cleanly.
- **Cost / free tier:**
  - Vercel **Hobby**: 1M function invocations, 100 GB fast data transfer, 4
    CPU-hrs active, 100 deploys/day (vercel.com/docs/limits). Orders of magnitude
    above this event's needs.
  - Neon **Free**: 0.5 GB storage/project, 100 CU-hrs/project/mo, up to 100
    projects; **scale-to-zero after 5 min is mandatory** on free (neon.com/docs/introduction/plans)
    → expect a ~sub-second cold start on the first request, irrelevant here.
  - Supabase **Free** alternative: 500 MB DB, **max 2 active projects**, and
    **projects pause after 1 week of inactivity** (supabase.com/pricing) — fine
    for a one-day event but the auto-pause is a footgun if you build early and
    leave it idle; Neon's scale-to-zero just resumes, so Neon is the safer pick.
- **Accounts:** 2 (Vercel + Neon), or 1 if you use Supabase for the DB. Both
  Git/GitHub-based.
- **Sensitive-data posture:** Data sits in one managed Postgres over TLS, in a
  region you choose. No login means the return view must be keyed on an
  **unguessable token** (random UUID in the cookie), never a sequential id.
  Delete the data after the event. Reasonable and fully in your control.

### 2. Cloudflare Pages + Workers + D1 + Cron Triggers — RUNNER-UP

- **Setup effort:** Slightly higher. You configure `wrangler`, a D1 binding, and
  a Worker/Pages Function. More concepts for a non-infra person, but all one
  vendor and well-documented.
- **Scheduling story:** **Best native scheduling of any candidate.** Cron
  Triggers are **included on the Free plan** (up to 5 per account) and run at
  **minute precision** — unlike Vercel Hobby's ±59 min
  (developers.cloudflare.com/workers/platform/limits). So a true "fire at the
  reveal minute" scheduled job is possible on free. (An on-demand endpoint still
  works too.)
- **Data-model fit:** D1 is SQLite → same clean relational model as option 1.
- **Cost / free tier:** Workers Free = **100,000 requests/day**, 10 ms CPU/request,
  Cron Triggers included. D1 Free = **5M rows read/day, 100k rows written/day,
  5 GB storage** (developers.cloudflare.com/d1/platform/pricing). Vastly above
  need. Cloudflare has stated D1 free access is permanent.
- **Accounts:** **1** (Cloudflare covers hosting + DB + cron) — the fewest of any
  full-stack option.
- **Sensitive-data posture:** Data in Cloudflare D1 over TLS; same unguessable-
  token requirement for the no-auth return view. Single-vendor = one processor.
- **Why runner-up not winner:** The config overhead (wrangler/bindings/D1 schema
  migrations) is the one thing that pushes a non-infra-heavy user past the
  "zero-config" bar, and the precise cron it wins on isn't actually needed given
  the manual-endpoint approach. If the builder is comfortable with `wrangler`,
  this is arguably the cleanest single-account answer.

### 3. Google Apps Script + Google Sheets

- **Setup effort:** No deploy pipeline, one Google account, but the web-app model
  is clunky: pages run inside a sandboxed iframe, `doGet`/`doPost` handlers, and
  cookie/localStorage handling in that iframe is awkward — the return-view keying
  is fiddlier than in Next/Workers.
- **Scheduling story:** Genuine **time-driven triggers** ("similar to a cron job",
  down to every minute, up to specific days/times) via
  `ScriptApp.newTrigger().timeBased()` (developers.google.com/apps-script/guides/triggers/installable).
  A one-time-at-a-set-time trigger is doable. Or trigger the assignment manually
  by running the function. Fine for one job.
- **Data-model fit:** A Sheet as a table works for a few hundred rows, but you
  hand-roll the derangement in Apps Script and there are no real relations.
- **Cost / free tier:** Free on a consumer account. Relevant quotas:
  **triggers total runtime 90 min/day**, **script runtime 6 min/execution**,
  URL Fetch 20,000/day (developers.google.com/apps-script/guides/services/quotas).
  All far above this event.
- **Accounts:** **1** (Google).
- **Sensitive-data posture:** Data lives in *your own* Google Drive/Sheet — good
  control — but a public web app is typically deployed "execute as me / anyone can
  access", so the `doGet`/`doPost` surface is open and the backing Sheet must be
  kept unshared. Acceptable, but the clunky UX + iframe cookie friction make it a
  worse fit than 1 or 2 for a warm, polished mobile page.

### 4. Form-builder + automation (Tally / Airtable + Make / Zapier) — DISQUALIFIED for this app

- **Setup effort:** Lowest of all *for collecting submissions* — Tally Free is
  **unlimited forms and unlimited submissions** with a hosted HTTPS form
  (tally.so/pricing). Genuinely zero-config to stand up a QR-able submit form.
- **Why it fails the brief:** It only solves requirement #2. The **cyclic
  derangement** and especially the **per-person cookie-keyed return view** are
  not things a form-builder or Make/Zapier can serve — there is no personalized
  dynamic page keyed on a visitor cookie. You would still have to build a custom
  app for the return view, at which point the form-builder is redundant.
- **Scheduling story:** Make **Free** can't schedule at a specific time — **15-min
  minimum interval**, minute-level scheduling requires a paid plan
  (make.com/en/pricing) — and only 2 active scenarios / 1,000 ops/mo.
- **Sensitive-data posture:** **Worst.** Prayer text would pass through a form
  vendor *and* an automation vendor (two extra processors) instead of one DB you
  control. For sensitive personal/pastoral content that is the least desirable
  posture.
- **Verdict:** Great for a plain survey; wrong tool for a stateful matcher with a
  personalized no-auth return view.

## Recommendation

**Build it as a single small Next.js app on Vercel (Hobby, free) with Neon
Postgres (free), and run the assignment as an on-demand protected admin endpoint
the organizer hits at reveal time** (not Vercel Hobby cron, which is once-daily
and ±59 min imprecise).

Why this wins for a non-infra-heavy builder on a 1–2 day timeline:
- Truly zero-config deploy: `git push` gives an HTTPS URL for the QR, no CI.
- Cookies/localStorage and personalized responses are native → the return view is
  easy, and the derangement is a few lines over a real SQL table.
- The one job is a manual endpoint = dead reliable timing, no cron caveats.
- Free tiers are ~1000× the event's scale; data sits in one managed DB you
  control (delete after the event; key the return view on a random UUID cookie).
- Best-trodden path → most tutorials / AI assistance when stuck.

**Runner-up: Cloudflare Pages + Workers + D1 + Cron Triggers** — a single account,
generous free tier, and the only candidate with free minute-precise cron if you
prefer a true scheduled reveal. Costs a bit more `wrangler`/binding config, which
is the only reason it isn't the top pick.

Note (per map.md): final host is confirmed later against actual headcount
(ticket 01); at a few hundred rows every option above is comfortably within free
limits, so headcount will not change this ranking.

## Sources

- Vercel cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel plan limits: https://vercel.com/docs/limits
- Neon plans: https://neon.com/docs/introduction/plans
- Supabase pricing: https://supabase.com/pricing
- Cloudflare Workers limits (incl. Cron Triggers on Free): https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Apps Script installable/time-driven triggers: https://developers.google.com/apps-script/guides/triggers/installable
- Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- Tally pricing: https://tally.so/pricing
- Make pricing: https://www.make.com/en/pricing
