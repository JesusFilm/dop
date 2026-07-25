import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/db";
import {
  CONFIRMATION_COPY,
  comeBackLine,
  revealBadgeLine,
} from "@/lib/confirmation";
import {
  findCurrentSession,
  findSubmissionByDeviceToken,
} from "@/lib/repository";
import { isRevealOpen, msUntilReveal } from "@/lib/reveal";
import { DEVICE_TOKEN_COOKIE } from "@/lib/submit";
import { formatZonedTime, formatZonedWeekdayTime } from "@/lib/time";

import { Countdown } from "../Countdown";
import { SaveCodeImage } from "./SaveCodeImage";

// Reads the device cookie and live database state — never cache.
export const dynamic = "force-dynamic";

const pageStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "2rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
};

/**
 * The confirmation screen shown straight after a submission (§7.2): the locked
 * thank-you copy, a clock badge stating the session's configured reveal time,
 * and the **recovery code** — the bearer credential that restores the return
 * view on any device (#8, §7.4) — shown large under the loud screenshot
 * instruction, with the Web-Share "save as image" affordance beside it.
 *
 * **Owner-scoped.** The code is resolved from this device's own cookie, so the
 * page shows only the caller's own credential and never a submission's request
 * content (Privacy #3). A device with no entry, or a request that arrives once
 * the app clock has passed the reveal, is sent to `/` — the landing page is the
 * single authority on what a participant should be seeing at that moment (§5).
 *
 * **Live at the boundary.** This is where a participant is sent immediately
 * after submitting, so it is the screen most likely to be left open when the
 * reveal arrives — and its own copy tells them to wait for that moment. The
 * server gate below only runs per request, so the {@link Countdown} carries the
 * page across the boundary: at zero it asks the server to re-render, the gate
 * re-evaluates against the app clock, and the participant is forwarded to `/`
 * instead of sitting on "come back later" copy that has quietly gone false.
 */
export default async function Confirmed() {
  const db = getDatabase();
  const session = await findCurrentSession(db);
  if (!session) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const deviceToken = cookieStore.get(DEVICE_TOKEN_COOKIE)?.value;
  const submission = deviceToken
    ? await findSubmissionByDeviceToken(db, session.id, deviceToken)
    : null;
  if (!submission) {
    redirect("/");
  }

  // Read the app clock once and derive both the gate and the countdown's anchor
  // from that single reading, so the countdown cannot disagree with the gate
  // decision that rendered it (§5).
  const now = new Date();

  // Past the reveal instant this screen's "come back later" copy would be
  // false — the reveal is now. Let the landing page serve that state (§5).
  if (isRevealOpen(now, session.revealAt)) {
    redirect("/");
  }

  const revealTime = formatZonedTime(session.revealAt, session.timeZone);
  const revealPhrase = formatZonedWeekdayTime(
    session.revealAt,
    session.timeZone,
  );

  return (
    <main style={pageStyle}>
      <header
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>
          {CONFIRMATION_COPY.heading}
        </h1>
        <p style={{ color: "#444", margin: 0, lineHeight: 1.5 }}>
          {comeBackLine(revealPhrase)}
        </p>
        <p
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: "0.5rem",
            margin: 0,
            padding: "0.6rem 1rem",
            borderRadius: "999px",
            background: "#eef2ff",
            color: "#2d3a7b",
            fontWeight: 600,
            fontSize: "0.95rem",
          }}
        >
          <span aria-hidden="true">🕚</span>
          {revealBadgeLine(revealTime)}
        </p>
        {/* The countdown's own root is an inline-flex pill; this wrapper keeps
            it from stretching to the header's full width, matching how the
            badge above sizes itself. */}
        <div style={{ alignSelf: "flex-start" }}>
          <Countdown
            initialRemainingMs={msUntilReveal(now, session.revealAt)}
          />
        </div>
      </header>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "1.25rem",
          border: "2px solid #c9d2f0",
          borderRadius: "0.75rem",
          background: "#f8faff",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "1.05rem",
            fontWeight: 700,
            color: "#1b2559",
          }}
        >
          {CONFIRMATION_COPY.screenshotInstruction}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: "#555",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {CONFIRMATION_COPY.recoveryCodeLabel}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: "ui-monospace, monospace",
            fontSize: "3rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#1b2559",
            wordBreak: "break-all",
          }}
        >
          {submission.recoveryCode}
        </p>
        <SaveCodeImage recoveryCode={submission.recoveryCode} />
      </section>

      <Link
        href="/"
        style={{ color: "#3b5bdb", fontSize: "0.95rem", textAlign: "center" }}
      >
        {CONFIRMATION_COPY.backLink}
      </Link>
    </main>
  );
}
