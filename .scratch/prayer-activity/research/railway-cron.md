# Railway Cron / Scheduled-Job Capability — Research

**Recommendation:** Do NOT rely on Railway cron for a sharp, on-the-second 11:00am reveal. Railway explicitly states cron "does not guarantee execution times to the minute... they can vary by a few minutes," so a cron-triggered pairing job could fire anywhere in roughly an 11:00–11:05 window. Railway cron IS suitable if a few minutes of slop is acceptable, or as a *safety-net trigger* fired early (e.g. 10:55 NZST) that computes pairings into storage, with the app *revealing* them at exactly 11:00 via its own client/server clock (decouple compute-time from reveal-time). If a hard 11:00:00 boundary matters, gate the reveal on wall-clock in the app, not on the cron firing instant.

Cron expression to write into the spec (UTC): **`0 23 26 7 *`** — 23:00 UTC Sun 2026-07-26 = 11:00 NZST Mon 2026-07-27 (NZST = UTC+12, no DST in July). To buy a safety margin so pairings are ready before the reveal, use **`55 22 26 7 *`** (22:55 UTC = 10:55 NZST) and reveal at 11:00 from the app.

---

## 1. Does Railway support cron on a service? Config mechanism
Yes. Cron is a per-service setting, not a separate resource type. Configure it either:
- **Dashboard:** select the service → Settings → enter a crontab expression in the **"Cron Schedule"** field; save and the service runs on that schedule. Source: https://docs.railway.com/cron-jobs
- **Config as code:** `railway.toml` / `railway.json` support a `deploy.cronSchedule` field (docs: "Cron schedule of the deployed service"; may be `null`). Example:
  ```json
  { "$schema": "https://railway.com/railway.schema.json", "deploy": { "cronSchedule": "*/15 * * * *" } }
  ```
  Source: https://docs.railway.com/config-as-code/reference

## 2. Cron syntax + timezone
- **Standard Unix 5-field crontab**: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-7, 0/7=Sun). Supports `*`, comma lists, ranges (`-`), step values (`/`), and integers. Source: https://docs.railway.com/cron-jobs
- **Timezone: UTC.** "Schedules are based on UTC (Coordinated Universal Time)." You must convert NZST → UTC yourself. Source: https://docs.railway.com/cron-jobs

## 3. Precision / reliability / caveats
- **Best-effort, NOT minute-precise:** "Railway does not guarantee execution times to the minute as they can vary by a few minutes." Explicitly called out as unsuitable for time-critical tasks. Sources: https://docs.railway.com/cron-jobs , https://docs.railway.com/guides/cron-workers-queues
- **Minimum interval: 5 minutes.** "The shortest time between successive executions of a cron job cannot be less than 5 minutes." Source: https://docs.railway.com/cron-jobs
- **Overlap = skip:** "If a previous execution is still running when the next scheduled execution is due, Railway will skip the new cron job." Source: https://docs.railway.com/cron-jobs

## 4. Execution model
Railway **runs the service's start command on the schedule** (starts the container/deployment). It is NOT an endpoint-ping model. The process is expected to do its work and then **exit**: it "should close any connections, such as database connections, to exit properly"; services "are expected to execute a task, and terminate as soon as that task is finished." A long-running / web-serving process that never exits will cause later scheduled runs to be skipped (see overlap rule) — so a cron service should be a one-shot worker, separate from any always-on web service. Recommended one-shot pattern for a single fire on a specific day: pin the exact date in the expression (`0 23 26 7 *`), have the container compute + persist results and exit. Source: https://docs.railway.com/cron-jobs , https://docs.railway.com/guides/cron-workers-queues

## 5. Plan requirement + usage/credits
- **No separate paywall for cron.** It is a standard service setting available on Hobby/Pro (and the 30-day free trial grants "the same features as on the Hobby plan"). No Railway doc gates cron behind a specific paid tier. Sources: https://docs.railway.com/pricing/plans , https://docs.railway.com/pricing/free-trial
- **Consumes normal resource usage** — a cron service is billed like any service, metered only while running: it "lets you run scripts at specific times and only pay for the time they're running." Since the org already pays for Railway (Pro/Hobby), a short one-shot cron job costs only the compute for its brief run. Sources: https://docs.railway.com/cron-jobs , https://docs.railway.com/pricing/understanding-your-bill

---

## Caveats for the event spec
- The few-minutes drift is the decisive risk. A "reveal at 11:00" that fires when cron fires will look sloppy and could be late. Decouple: fire cron early (22:55 UTC / 10:55 NZST), compute pairings, store them, and let the app reveal at exactly 11:00 by its own clock.
- Cron cannot fire more often than every 5 min, so it cannot be used as a tight retry loop; build idempotency + a manual re-trigger path.
- Ensure the pairing job is its own dedicated service that exits cleanly (not folded into the web service), or the overlap-skip rule and the "must terminate" requirement can bite.
- Double-check NZ offset: July is NZ winter, standard time UTC+12 (NZDT/+13 only applies late Sep–early Apr), so 11:00 NZST → 23:00 UTC on the prior calendar day (Sun 26th). Verify the cron day-of-month is 26, not 27.
