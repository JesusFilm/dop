# Prayer Activity — QR prayer-request matcher

**Locked spec + build-ready ticket plan.** Target event: **Monday 2026-07-27**.

This document is the terminal deliverable of the wayfinder map
([#1](https://github.com/edmonday/secret-prayer/issues/1)). Every decision below is
locked in a closed decision ticket, linked inline. Building and deploying the app is
**out of scope** for the map — this is the spec someone builds *from*.

---

## 1. What we're building (one paragraph)

A one-day, single-session web app for an in-person "day of prayer". People scan a QR
code, submit their **first name + a personal prayer request** (with a gentle,
optional prompt), and are told to come back after 11:00. Submissions **hard-close at
11:00** by the app's own clock; a **write-once** random pairing then guarantees
**everyone is matched** — no doubles, no one missed, no self-assignment. Returning on
the **same phone** (cookie) — or on any device via a **recovery code** — each person
sees **who they're paired with and that partner's request**, and goes to find them and
pray **together, in person**. A request is visible **only within your group**. All data
is **auto-deleted the next morning**.

---

## 2. Locked decisions (traceability)

| # | Decision | Ticket |
|---|----------|--------|
| Scope | ~100 participants (organizers included); mutual in-person **pairing**, trio when odd; names shown; submit 9am, reveal ~11am; QR shown multiple ways | [Scope & logistics #2](https://github.com/edmonday/secret-prayer/issues/2) |
| Privacy | Request seen by **your group only**; no public list, **no organizer all-requests view**; name shown to partner(s); consent stated up front; **deleted next day**; no minors, no org policy | [Privacy & data handling #3](https://github.com/edmonday/secret-prayer/issues/3) |
| Stack survey | Surveyed hosts (recommended Vercel+Neon); **superseded** by #5's Railway pick for scheduler reliability + existing org spend | [Zero-config stack survey #4](https://github.com/edmonday/secret-prayer/issues/4) |
| Assignment | Shuffle → pairs, one trio when odd; identity = submission id; **write-once freeze**; app-clock-sharp 11:00 reveal + hard cutoff; **host = Railway**; one submission per device | [Assignment model #5](https://github.com/edmonday/secret-prayer/issues/5) |
| Form copy | Tone **A (warm) + C (starter chips)**; fields = name + request only; consent line; confirmation states 11:00 + in-person pairing | [Form + confirmation copy #7](https://github.com/edmonday/secret-prayer/issues/7) |
| Return flow | **Guided-steps** return view; partner name + request shown; **in person only**, no messaging, no "mark as prayed" | [Return & connection flow #6](https://github.com/edmonday/secret-prayer/issues/6) |
| Setup + QR | Lightweight **no-auth, create-once** organizer setup page that also **produces the QR**; unguessable URL | [Organizer session setup & QR #9](https://github.com/edmonday/secret-prayer/issues/9) |
| Runbook | Day-of ordered runbook; **self-service recovery code**; setup-page count + backstop button; **auto-purge + verify** | [Day-of operational runbook #8](https://github.com/edmonday/secret-prayer/issues/8) |

> Note: [#11 (trios-first)](https://github.com/edmonday/secret-prayer/issues/11) was
> considered and **withdrawn** — the pairing-with-trio-when-odd model in #5/#2 stands.

---

## 3. Data model

Session-keyed throughout, so reuse later is "insert another session", not a rewrite
(the [#5](https://github.com/edmonday/secret-prayer/issues/5) reusability seam).
Monday runs as **one session**.

```
Session {
  id
  name
  setupPath        // unique/unguessable slug for the organizer setup page (#9)
  opensAt          // 2026-07-27 09:00 NZST
  revealAt         // 2026-07-27 11:00 NZST  (NZST = UTC+12, no DST)
  purgeAfter       // next-morning purge time
  pairingFrozenAt  // null until the write-once freeze fires
}

Submission {
  id               // identity is this id, NOT the name (#5)
  sessionId
  deviceToken      // cookie value; unique per session (one submission per device)
  recoveryCode     // short, shown once at submit; bearer credential (#8)
  name             // first name
  request          // the prayer request text
  createdAt
}

Group {
  id
  sessionId
  memberSubmissionIds[]   // size 2, or exactly one size-3 per session when odd
}
```

**Storage constraints (from Privacy #3):**
- Requests must be retrievable **only per-assignment** (a member fetching their own
  group). No list/all endpoint, no admin request view.
- `recoveryCode` and `deviceToken` are bearer credentials — same privacy risk profile
  as the return link; no new exposure model.

---

## 4. Assignment algorithm (locked, [#5](https://github.com/edmonday/secret-prayer/issues/5))

Runs **once per session, write-once**:

1. Take all `Submission`s for the session with `createdAt < revealAt` (11:00).
2. Shuffle randomly.
3. **Even count** → consecutive pairs of 2. **Odd count** → consecutive pairs, and the
   final leftover **joins the last pair → exactly one Group of 3**.
4. **Freeze** (`pairingFrozenAt` set). Never recompute.

**Small-n:** `n=0` → nothing to reveal. `n=1` → lone person sees a gentle "not enough
people this time" (never self-matched). `n=2` → one pair. `n=3` → one trio.

**Invariants:**
- Every submission (n≥2) is in exactly one group — no one left out.
- No self-assignment; every group has ≥2 distinct people.
- Membership is mutual (you're in your partner's group too).
- Write-once: a frozen group never changes.
- Two people with the same name are two participants (identity = submission id).

---

## 5. Reveal timing (locked, [#5](https://github.com/edmonday/secret-prayer/issues/5))

**The app's own clock owns the sharp 11:00 moment. The scheduler is only a compute
trigger, never the source of the sharp reveal** (Railway cron is best-effort, can drift
a few minutes — see `research/railway-cron` branch, `.scratch/prayer-activity/research/railway-cron.md`).

- **Submissions hard-close at 11:00:00** by app clock. Late arrivals miss out
  gracefully; organizer covers in person.
- **Reveal view gated on app-clock ≥ 11:00** — countdown before, partner after. Sharp
  regardless of cron drift.
- **Pairing computed + frozen** by whichever fires first *after* 11:00, all safe via
  write-once:
  1. Organizer "Run pairing now" backstop button (setup page, ≥11:00 only), or
  2. First reveal-page load (lazy compute), or
  3. Railway cron backstop.
- **Railway cron backstop expression (UTC):** `0 23 26 7 *` = 23:00 UTC Sun 26 Jul =
  11:00 NZST Mon 27 Jul. **The UTC date is the 26th** (NZST = UTC+12).

---

## 6. Submission / edit rules (locked, [#5](https://github.com/edmonday/secret-prayer/issues/5))

- **One submission per `deviceToken`** (cookie).
- Returning on the same phone **before 11:00** → entry pre-filled, name/request
  **editable**.
- **After 11:00** → locked ("you're in, come back at 11am"), then becomes the reveal
  view.

---

## 7. Screens & copy

### 7.1 Submit screen (locked copy, [#7](https://github.com/edmonday/secret-prayer/issues/7))

- **Heading:** *Share something to pray for*
- **Intro:** *This morning we're praying for one another. Write down what's on your
  heart — one other person will carry it with you.*
- **Starter chips** (optional, above the request field; tapping prefills a sentence
  starter): Someone I love · A decision I'm facing · Something I'm worried about ·
  Something I'm thankful for · My work · My health
- **Fields:** **Your name** (first name fine) + **What would you like prayer for?**
  - Placeholder: *It doesn't need to be big or polished — a worry, a hope, someone you
    love, a decision you're facing.*
- **Consent line** (locked to Privacy [#3](https://github.com/edmonday/secret-prayer/issues/3)):
  *Just one person — the one you're paired with — will read this. It's never shown
  publicly, no one sees everyone's, and it's all deleted tomorrow.*
- **Button:** *Share my request* · **Fine print:** *Submissions close at 11:00.*

### 7.2 Confirmation screen ([#7](https://github.com/edmonday/secret-prayer/issues/7) + recovery code from [#8](https://github.com/edmonday/secret-prayer/issues/8))

- **Copy:** *Thank you — it's in. Come back to this page after 11:00 and we'll show you
  who you're praying for. Find each other, and pray together.*
- **Clock badge:** "See who you're paired with — after 11:00"
- **Recovery code** (large, prominent):
  - Loud instruction: *📸 Screenshot this — it's how you get back in.*
  - **"Save code as image"** button via Web Share API (render code to canvas → share
    sheet → Save to Photos). Hidden/graceful where `navigator.share` file-sharing is
    unsupported.

### 7.3 Return view ([#6](https://github.com/edmonday/secret-prayer/issues/6) — "Guided steps")

- **Before 11:00:** status header *"Your request is in"* (submit time + "locked at
  11:00"), then two numbered "what happens next" steps. `Edit my request` available. No
  partner shown yet.
- **After 11:00:** status header *"You're paired with {name(s)} · go find them in the
  room"*, then **per partner** a numbered card: *"{Name} asked prayer for"* + their
  request in warm serif quote framing. **Partner name is shown** with the request
  (privacy #3: visible only within the group).
- **Trio (odd count):** both partner names in the header, one request card each.
- **Connection: in person only** — "go find them in the room." No in-app messaging, no
  contact exchange, **no "mark as prayed."**
- **No cookie + no recovery code:** graceful message — *"you're probably on a different
  phone; enter your recovery code, or find an organizer."* No name-lookup logic.

### 7.4 Recovery-code entry ([#8](https://github.com/edmonday/secret-prayer/issues/8))

- On the return page, accept a recovery code to restore the session on **any device**.
- Self-service; organizer never involved, never sees requests (#3 holds).
- **Lost both cookie and code** → accepted limitation, no organizer fallback; handled
  informally in the room.

### 7.5 Organizer setup page ([#9](https://github.com/edmonday/secret-prayer/issues/9))

- Lives at a **unique/unguessable path**. **No auth, no login.**
- **Create-once:** first visit creates the one session; afterward the page is
  **read-only** — shows QR + submission count, **no reset/create-again button** (protects
  live requests). Reset is a dev/DB action only.
- **Produces the QR** (+ its URL) to download/print/screenshot. (Client-side vs server
  QR render is a build detail, not blocking.)
- **Live submission count** only — never request content (#3).
- **Backstop button** — visible only at/after 11:00, forces the write-once freeze,
  disables once fired.

---

## 8. App affordances the build must include ([#8](https://github.com/edmonday/secret-prayer/issues/8))

1. **Recovery code** — per submission, shown large on confirmation with the screenshot
   instruction + Web-Share "save as image"; accepted on the return page to restore on
   any device.
2. **Setup-page submission count** — live count only, no request content.
3. **Backstop button** — setup page, ≥11:00 only, forces the freeze, disables after.
4. **Auto-purge job** — Railway cron deletes the session's submissions the next morning;
   the setup-page count doubles as the verification view (reads 0 when done).

---

## 9. Host / stack (locked, [#5](https://github.com/edmonday/secret-prayer/issues/5))

**Railway** — app + Postgres + cron on one platform. Chosen for a reliable-enough
scheduler and because the org already pays for Railway. **Supersedes** the
[stack survey #4](https://github.com/edmonday/secret-prayer/issues/4) Vercel+Neon
recommendation (the survey's on-demand-vs-cron reasoning still informs the trigger
design). Railway cron is a compute **backstop only** — the app clock owns 11:00.

---

## 10. Day-of runbook (Monday 2026-07-27) ([#8](https://github.com/edmonday/secret-prayer/issues/8))

**Before 9am**
- Open the setup page (unguessable URL); create the session if not already; grab the QR
  (screenshot/print).
- Get the QR in front of people: slide + posters/handout.
- Test the full round-trip on a real phone: scan → submit → confirmation + recovery
  code → reopen return page → confirm the pre-11:00 "you're in" state.

**9am–11:00 (submissions open)**
- Keep the setup page open. The live **submission count** is the only dashboard — no
  request content (#3). Watch it climb; chase stragglers verbally if low.

**11:00 (reveal)**
- App clock owns the sharp moment; submissions hard-close at 11:00.
- Pairing freezes (write-once) on the first trigger after 11:00.
- If reveal hasn't fired, click the **backstop button** on the setup page. One click
  forces the freeze; disables afterward.
- Announce: everyone reopens their link / rescans → sees who they're paired with → go
  find them and pray together.

**Edge handling**
- Different phone / cleared cookie → enter **recovery code** on the return page
  (self-service).
- Lost both cookie and code → reassure in person, pair informally in the room. No app
  recovery.
- Late arrival after 11:00 → hard cutoff; covered in person.

**Next day (Tue AM)**
- Auto-purge (Railway cron) wipes the session's submissions at a set early-morning time.
- Verify: open the setup page → count reads 0 / data gone. If it didn't fire, run the
  manual DB delete.

---

## 11. Build-ticket plan (ordered)

Implement in this order before Monday 2026-07-27. Each ticket is sized to be
independently buildable; dependencies noted.

1. **Project + Railway scaffold** — app framework + Postgres on Railway, one deploy
   pipeline, env/secrets. *(Blocks everything.)*
2. **Data model + migrations** — `Session`, `Submission`, `Group` per §3, with the
   per-assignment-only retrieval constraint. *(Depends: 1.)*
3. **Organizer setup page + QR** (§7.5, #9) — unguessable path, create-once session,
   QR generation + download, read-only after create. *(Depends: 2.)*
4. **Submit flow** (§7.1, #7) — QR landing → submit screen with warm copy + starter
   chips + consent line; one submission per `deviceToken`; pre-11:00 edit. *(Depends: 2.)*
5. **Confirmation + recovery code** (§7.2, #8) — recovery-code generation, screenshot
   instruction, Web-Share "save as image" (graceful fallback). *(Depends: 4.)*
6. **App-clock gating + hard cutoff** (§5, §6) — server-authoritative 11:00 close;
   reveal gated on app clock; countdown before. *(Depends: 2.)*
7. **Pairing algorithm + write-once freeze** (§4) — shuffle→pairs/trio, small-n cases,
   invariants; freeze idempotent across all three triggers. *(Depends: 2, 6.)*
8. **Reveal triggers** (§5) — lazy compute on first reveal load; setup-page backstop
   button (≥11:00, disables after); Railway cron backstop `0 23 26 7 *` UTC. *(Depends: 7.)*
9. **Return view** (§7.3, §7.4, #6) — guided-steps before/after states, partner card(s),
   trio handling, recovery-code entry, no-cookie/no-code graceful message. *(Depends: 7.)*
10. **Auto-purge job + verification** (§8, #8) — Railway cron next-morning delete;
    setup-page count as verify view. *(Depends: 2, 3.)*
11. **Round-trip test pass + copy polish** — full phone round-trip; "day of prayer" /
    "prayer request" vocabulary softening pass (raised in #7, non-blocking, done here).
    *(Depends: all.)*

---

## 12. Out of scope (map [#1](https://github.com/edmonday/secret-prayer/issues/1))

- **Building & deploying the actual app** — this doc is the plan; execution is separate
  work after.
- **Post-event features** (thank-you notes, follow-up, analytics).
- **Accounts, auth & the multi-session product** (organizer login, managing multiple
  sessions, multi-tenant). A *single-session, no-auth* setup UI is in scope (#9); what
  stays out is accounts/login and many-session management. The #5 session seam keeps the
  door open as a fresh effort if ever wanted.
