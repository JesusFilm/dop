import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { getDatabase } from "@/lib/db";
import { RECOVERY_COPY } from "@/lib/recovery";
import {
  countGroups,
  findCurrentSession,
  findSubmissionByDeviceToken,
  getGroupAssignment,
} from "@/lib/repository";
import { isRevealOpen, msUntilReveal } from "@/lib/reveal";
import { partnersOf, RETURN_COPY, selectReturnState } from "@/lib/return-view";
import {
  DEVICE_TOKEN_COOKIE,
  submissionsClosedLine,
  SUBMIT_COPY,
} from "@/lib/submit";
import { formatZonedDateTime, formatZonedTime } from "@/lib/time";

import { AutoRefresh } from "./AutoRefresh";
import { RecoveryPanel } from "./RecoveryPanel";
import { PairedReturn, PreRevealReturn } from "./ReturnView";
import { submitAction } from "./actions";
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

/** A centred single-message screen — the no-session, pending, and lone states. */
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={noticeStyle}>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{title}</h1>
      <p style={{ color: "#555", margin: 0 }}>{children}</p>
    </main>
  );
}

/**
 * The participant landing — where a scanned QR opens (§1) and where someone
 * returns to (§7.3). Resolves the single session and this device's entry, then
 * shows one of:
 *
 * - **No session yet** — a gentle "not open" notice.
 * - **No entry, before reveal** — the warm submit screen (§7.1), plus a link to
 *   recovery-code entry for someone who submitted on another phone (§7.4).
 * - **Own entry, before reveal** — the pre-reveal return view (§7.3): status
 *   header with the submit time, live countdown (#20), numbered next steps, and
 *   `Edit my request` (§6).
 * - **Own entry, after reveal** — the paired return view (§7.3): partner full
 *   name(s) (#13) and a request card each; a trio needs no special case. Before
 *   the freeze lands (§4) a brief "in just a moment" notice; for the lone n=1
 *   participant, the gentle small-n message.
 * - **No entry, after reveal** — the graceful no-cookie/no-code message with
 *   recovery-code entry inline (§7.3, §7.4), since submissions have hard-closed
 *   (§6) and a new entry is no longer possible.
 *
 * The reveal boundary is decided by {@link isRevealOpen} against the app's own
 * clock (§5, #20) — never a scheduler trigger — so the gate is sharp regardless
 * of cron drift, and partner content is simply absent from the response before
 * the reveal instant.
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

  // The caller's partners, read only once the app clock has opened the reveal.
  // `getGroupAssignment` is the only path to request content (Privacy #3) and
  // returns this caller's own group or nothing; skipping the read before the
  // reveal keeps partner data out of the pre-reveal request entirely.
  const partners =
    revealOpen && existing
      ? partnersOf(
          await getGroupAssignment(db, {
            sessionId: session.id,
            submissionId: existing.id,
          }),
        )
      : [];

  const pairingFrozen = session.pairingFrozenAt !== null;

  // Whether the frozen pairing produced any group at all — the one thing that
  // separates "yours was the only request" from "the room got paired and you
  // were left out" (§7.3). Read only in that narrow case: it is the sole branch
  // that consults it, and the reveal instant is a thundering herd, so the common
  // paths must not pay for a query they never look at. A bare count, so no
  // request content crosses the boundary (Privacy #3).
  const sessionHasGroups =
    revealOpen && existing !== null && pairingFrozen && partners.length === 0
      ? (await countGroups(db, session.id)) > 0
      : false;

  // Returning on the same phone, or on a device restored by a recovery code
  // (§6, §7.4 — recovery adopts the entry's device token, so both land here).
  // The `pre-reveal` state is only ever chosen when an entry exists, but that
  // correlation is invisible to the type checker, so the view is built here
  // where `existing` is narrowed and the switch below only places it.
  const preRevealReturn = existing ? (
    <PreRevealReturn
      sharedLabel={formatZonedTime(existing.createdAt, session.timeZone)}
      revealLabel={revealLabel}
      remainingMs={msUntilReveal(now, session.revealAt)}
      defaults={{
        firstName: existing.firstName,
        lastName: existing.lastName,
        request: existing.request,
      }}
    />
  ) : null;

  const state = selectReturnState({
    hasEntry: existing !== null,
    revealOpen,
    pairingFrozen,
    partnerCount: partners.length,
    sessionHasGroups,
  });

  switch (state) {
    case "pre-reveal":
      return <main style={pageStyle}>{preRevealReturn}</main>;

    case "paired":
      return (
        <main style={pageStyle}>
          <PairedReturn partners={partners} />
        </main>
      );

    // Only reachable when the freeze produced no groups whatsoever, so the
    // cause this copy states is actually known to be true (§4 small-n).
    case "lone":
      return (
        <Notice title={RETURN_COPY.loneHeading}>{RETURN_COPY.loneBody}</Notice>
      );

    // The pairing paired the room but not this entry. Shouldn't happen; says so
    // without inventing a cause, and hands them to an organizer (§10).
    case "unpaired":
      return (
        <Notice title={RETURN_COPY.unpairedHeading}>
          {RETURN_COPY.unpairedBody}
        </Notice>
      );

    // `AutoRefresh` owns this screen's body copy as well as the refreshing:
    // it keeps asking the server for a fresh render until the freeze lands and
    // the partner view replaces it, and when its bounded retries are spent it
    // swaps the copy for a manual retry — so the page never goes on promising to
    // catch up after it has stopped trying.
    case "pending-freeze":
      return (
        <Notice title={RETURN_COPY.pendingHeading}>
          <AutoRefresh />
        </Notice>
      );

    // No entry on this device, and submissions have hard-closed (§6): the only
    // way forward is restoring an existing entry (§7.3, §7.4). This visitor may
    // equally be a latecomer who never submitted (§10), so the heading states
    // the cutoff — the thing that is certainly true — and offers recovery under
    // it rather than assuming they are on a second phone.
    case "recover":
      return (
        <main style={pageStyle}>
          <RecoveryPanel
            heading={SUBMIT_COPY.closedHeading}
            lead={submissionsClosedLine(revealLabel)}
          />
        </main>
      );

    // The warm submit screen (§7.1). Someone who already submitted on another
    // phone gets a quiet route to recovery rather than a second entry (§7.4).
    case "submit":
      return (
        <main style={pageStyle}>
          <header
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <h1 style={{ fontSize: "1.6rem", margin: 0 }}>
              {SUBMIT_COPY.heading}
            </h1>
            <p style={{ color: "#444", margin: 0, lineHeight: 1.5 }}>
              {SUBMIT_COPY.intro}
            </p>
          </header>
          <SubmitForm
            action={submitAction}
            mode="create"
            revealLabel={revealLabel}
          />
          <p style={{ margin: 0, fontSize: "0.85rem", textAlign: "center" }}>
            <Link href="/recover" style={{ color: "#3b5bdb" }}>
              {RECOVERY_COPY.linkLabel}
            </Link>
          </p>
        </main>
      );

    // An eighth state added to `ReturnViewState` without a case here would
    // otherwise fall out of this function as `undefined` — `tsc` does not catch
    // it (no `noImplicitReturns`), and neither does the linter. This makes the
    // omission a compile error instead of a blank screen at the reveal.
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled return-view state: ${String(unhandled)}`);
    }
  }
}
