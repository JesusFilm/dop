import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { getDatabase } from "@/lib/db";
import {
  findCurrentSession,
  findSubmissionByDeviceToken,
} from "@/lib/repository";
import { DEVICE_TOKEN_COOKIE, isBeforeReveal, SUBMIT_COPY } from "@/lib/submit";
import { formatZonedDateTime } from "@/lib/time";

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
 * - **Own entry, before reveal** — the pre-reveal return view (§6): the entry
 *   pre-filled with name/request editable.
 * - **After the reveal** — submissions are hard-closed (§5/§6); the full reveal
 *   view and countdown land in later tickets (§7.3, steps 6/9).
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

  const beforeReveal = isBeforeReveal(new Date(), session.revealAt);
  const revealLabel = formatZonedDateTime(session.revealAt, session.timeZone);

  // Returning on the same phone (§6).
  if (existing) {
    if (!beforeReveal) {
      return (
        <Notice title="Your request is in">
          Come back here after the reveal time and we&rsquo;ll show you who
          you&rsquo;re praying for.
        </Notice>
      );
    }

    return (
      <main style={pageStyle}>
        <header
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Your request is in</h1>
          <p style={{ color: "#555", margin: 0 }}>
            You can change your name or request any time before {revealLabel}.
          </p>
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
  if (!beforeReveal) {
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
