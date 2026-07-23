# Zero-config stack survey

Type: research
Status: resolved
Blocked by: —

## Question

Survey and recommend a **zero-config, deploy-fast full-stack option** a non-heavy-infra user can stand up in ~1–2 days for a one-day, low-traffic event (assume small scale: at most a few hundred submissions total, one assignment job, low concurrency).

Requirements the stack must satisfy:
- Serve a mobile web page reachable by QR code (public URL, HTTPS).
- Accept + persist form submissions (name + free-text request).
- Run one assignment computation at/after a set time (a scheduled job, an on-demand endpoint, or a manual trigger — note which the option supports).
- Serve a per-person "return view" keyed off a **same-phone cookie/localStorage** (no auth/login).
- Free or near-free tier; minimal accounts to create.

Compare realistic candidates (e.g. Next.js on Vercel + a hosted DB like Vercel Postgres / Supabase / Turso; a Google Apps Script + Sheets backend; Cloudflare Pages + D1/KV; a form-builder + automation combo). For each: setup effort, scheduling story, data model fit, cost, and the sensitive-data handling posture. End with a single recommendation and why.

Capture findings as a Markdown file in the repo (research branch) and link it from this ticket. The final host choice is confirmed later against actual headcount (ticket 01).

## Answer

Findings captured on branch `research/stack-survey` at `.scratch/prayer-activity/research/stack-survey.md` (main untouched), with all free-tier limits + cron facts cited to official 2026 docs.

**Recommendation:** Next.js on Vercel (Hobby/free) + Neon Postgres (free). Run the assignment as an **on-demand, protected admin endpoint** the organizer hits at reveal time — *not* Vercel cron (Hobby cron is once-daily and ±59 min imprecise, verified in docs), so scheduled cron turns out to be a non-requirement.

**Runner-up:** Cloudflare Pages + Workers + D1 + Cron Triggers — single account, generous free tier, only candidate with free minute-precise cron; loses only on `wrangler`/binding config overhead for a non-infra user.

Key drivers:
- App is genuinely full-stack (persist submissions → run cyclic-derangement job → serve cookie-keyed per-visitor return view), so a form-builder + automation combo (Tally/Make) is **disqualified**: can't serve a per-visitor return view, worst sensitive-data posture (text through 2 extra processors), and Make Free can't schedule to a specific time.
- Apps Script + Sheets works with just a Google account but the sandboxed-iframe web-app model makes the mobile page + cookie return view clunky.
- At a few hundred rows / one job, every option is ~1000× under free-tier limits, so headcount (ticket 01) won't change the ranking — only confirms it.

Note: this resolves the *survey + recommendation*. Formally committing to the host is folded into the eventual spec assembly, where it can bake in ticket 01's confirmed headcount and ticket 02's data-handling posture.
