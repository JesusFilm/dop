import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { getDatabase } from "@/lib/db";
import {
  findCurrentSession,
  findSubmissionByDeviceToken,
} from "@/lib/repository";
import { isRevealOpen, msUntilReveal } from "@/lib/reveal";
import { DEVICE_TOKEN_COOKIE, SUBMIT_COPY } from "@/lib/submit";
import { formatZonedDateTime } from "@/lib/time";

import { Countdown } from "./Countdown";
import { editAction, submitAction } from "./actions";
import { SubmitForm } from "./SubmitForm";

// Depends on the device cookie and live database state — never cache.
export const dynamic = "force-dynamic";

const pageStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "2rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

const noticeStyle: React.CSSProperties = {
  ...pageStyle,
  textAlign: "center",
  minHeight: "60vh",
  justifyContent: "center",
};

/** A centred single-message screen — the no-session, closed, and locked states. */
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={noticeStyle}>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{title}</h1>
      <p style={{ color: "#555", margin: 0 }}>{children}</p>
    </main>
  );
}

/**
 * The participant submit landing — where a scanned QR opens (§1, §7.1). Resolves
 * the single session and this device's entry, then shows one of:
 *
 * - **No session yet** — a gentle "not open" notice.
 * - **No entry, before reveal** — the warm submit screen (§7.1): starter chips,
 *   two required name fields (#13), request, consent line.
 * - **Own entry, before reveal** — the pre-reveal return view (§6): a live
 *   countdown to the reveal (§7.3, #20) plus the entry pre-filled with
 *   name/request editable.
 * - **After the reveal** — submissions are hard-closed (§5/§6); the full reveal
 *   view is gated on the app clock and lands in a later ticket (§7.3, step 9).
 *
 * The reveal boundary is decided by {@link isRevealOpen} against the app's own
 * clock (§5, #20) — never a scheduler trigger — so the gate is sharp regardless
 * of cron drift.
 */
export default async function Home() {
  const db = getDatabase();
  const session = await findCurrentSession(db);

  if (!session) {
    return (
      <Notice title="Day of Prayer">
        This isn&rsquo;t open yet. Please check with an organizer.
      </Notice>
    );
  }

  const cookieStore = await cookies();
  const deviceToken = cookieStore.get(DEVICE_TOKEN_COOKIE)?.value;
  const existing = deviceToken
    ? await findSubmissionByDeviceToken(db, session.id, deviceToken)
    : null;

  // The app clock owns the sharp reveal moment (§5): read it once, gate every
  // branch on it, and derive the countdown's anchor from the same reading so the
  // countdown matches the server's gate decision.
  const now = new Date();
  const revealOpen = isRevealOpen(now, session.revealAt);
  const revealLabel = formatZonedDateTime(session.revealAt, session.timeZone);

  // Returning on the same phone (§6).
  if (existing) {
    if (revealOpen) {
      // Reveal time has arrived. The partner view itself lands in #9; until then
      // this is an accurate interim placeholder for someone who already has an
      // entry — not a "come back later" message (the reveal is now, not later).
      return (
        <Notice title="It&rsquo;s reveal time">
          Who you&rsquo;re praying for will appear here in just a moment.
        </Notice>
      );
    }

    return (
      <main style={pageStyle}>
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            alignItems: "flex-start",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Your request is in</h1>
          <Countdown
            initialRemainingMs={msUntilReveal(now, session.revealAt)}
          />
          <p style={{ color: "#555", margin: 0 }}>
            You can change your name or request any time before {revealLabel}.
          </p>
          {/* The recovery code is the only way back on another device (#8),
              so it stays reachable rather than being a one-shot screen. */}
          <Link href="/confirmed" style={{ color: "#3b5bdb" }}>
            See my recovery code
          </Link>
        </header>
        <SubmitForm
          action={editAction}
          mode="edit"
          revealLabel={revealLabel}
          defaults={{
            firstName: existing.firstName,
            lastName: existing.lastName,
            request: existing.request,
          }}
        />
      </main>
    );
  }

  // No entry yet: hard-closed after the reveal instant (§6).
  if (revealOpen) {
    return (
      <Notice title="Submissions have closed">
        The reveal time ({revealLabel}) has passed. Find an organizer — they can
        help in person.
      </Notice>
    );
  }

  // The warm submit screen (§7.1).
  return (
    <main style={pageStyle}>
      <header
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>{SUBMIT_COPY.heading}</h1>
        <p style={{ color: "#444", margin: 0, lineHeight: 1.5 }}>
          {SUBMIT_COPY.intro}
        </p>
      </header>
      <SubmitForm
        action={submitAction}
        mode="create"
        revealLabel={revealLabel}
      />
    </main>
  );
}
