import Link from "next/link";

import {
  formatFullName,
  nextSteps,
  pairedHeading,
  requestCardHeading,
  RETURN_COPY,
  sharedAtLine,
} from "@/lib/return-view";
import type { GroupMember } from "@/lib/repository";

import { Countdown } from "./Countdown";
import { editAction } from "./actions";
import { SubmitForm } from "./SubmitForm";

/**
 * The participant return view (§7.3, #6, #13) in its two app-clock-gated states.
 * Both are server-rendered: the gate is decided against the app's own clock by
 * the caller (`page.tsx`) and never client-side, so partner content simply is
 * not in the response before the reveal instant.
 */

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
};

const stepListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  margin: 0,
  paddingLeft: "1.5rem",
  color: "#444",
  lineHeight: 1.5,
};

/**
 * **Before the reveal** (§7.3): the status header with the submit time and the
 * "locked at reveal time" note, a live countdown (#20), the two numbered
 * "what happens next" steps, and `Edit my request` — which discloses the
 * pre-filled form (§6: name/request editable until the reveal). No partner is
 * shown, because there is not one yet: the pairing is not computed until the
 * reveal instant (§4).
 *
 * The edit form sits inside a `<details>` so the screen leads with the guided
 * steps rather than a form, and opening it costs no navigation or JavaScript.
 */
export function PreRevealReturn({
  sharedLabel,
  revealLabel,
  remainingMs,
  defaults,
}: {
  /** Wall-clock time the entry was shared, in the session's zone. */
  sharedLabel: string;
  /** The organizer-set reveal time, formatted in the session's zone (#14). */
  revealLabel: string;
  /** Milliseconds to the reveal, measured server-side against the app clock. */
  remainingMs: number;
  defaults: { firstName: string; lastName: string; request: string };
}) {
  return (
    <div style={columnStyle}>
      <header
        style={{ ...columnStyle, gap: "0.75rem", alignItems: "flex-start" }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>
          {RETURN_COPY.preRevealHeading}
        </h1>
        <Countdown initialRemainingMs={remainingMs} />
        <p style={{ color: "#555", margin: 0 }}>
          {sharedAtLine(sharedLabel, revealLabel)}
        </p>
        {/* The recovery code is the only way back on another device (#8), so
            the confirmation screen (§7.2) stays reachable from here rather than
            being a one-shot screen someone can never return to. */}
        <Link href="/confirmed" style={{ color: "#3b5bdb" }}>
          {RETURN_COPY.recoveryCodeLink}
        </Link>
      </header>

      <section style={{ ...columnStyle, gap: "0.75rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>
          {RETURN_COPY.nextStepsHeading}
        </h2>
        <ol style={stepListStyle}>
          {nextSteps(revealLabel).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <details>
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 600,
            color: "#3b5bdb",
            padding: "0.5rem 0",
          }}
        >
          {RETURN_COPY.editSummary}
        </summary>
        <div style={{ paddingTop: "1rem" }}>
          <SubmitForm
            action={editAction}
            mode="edit"
            revealLabel={revealLabel}
            defaults={defaults}
          />
        </div>
      </details>
    </div>
  );
}

/**
 * **After the reveal** (§7.3): the header names every partner's **full name**
 * (#13) and sends the participant into the room, then one numbered card per
 * partner — *"{Full Name} asked prayer for"* plus their request in warm serif
 * quote framing. A trio simply has two partners, so it needs no special case
 * here: both names land in the header and each gets a card.
 *
 * Privacy #3 holds structurally, not by omission here: the caller resolves these
 * members through `getGroupAssignment`, the only path to request content, which
 * returns the caller's **own** group and nothing else.
 *
 * Connection is in person only (#6) — no messaging, no contact exchange, no
 * "mark as prayed" — so this view is entirely read-only by design.
 */
export function PairedReturn({
  partners,
}: {
  partners: readonly GroupMember[];
}) {
  const names = partners.map(formatFullName);

  return (
    <div style={columnStyle}>
      <h1 style={{ fontSize: "1.5rem", margin: 0, lineHeight: 1.35 }}>
        {pairedHeading(names)}
      </h1>

      <ol
        style={{
          ...columnStyle,
          margin: 0,
          paddingLeft: "1.5rem",
        }}
      >
        {partners.map((partner, index) => (
          <li key={partner.submissionId}>
            <article style={{ ...columnStyle, gap: "0.6rem" }}>
              <h2
                style={{
                  fontSize: "1.05rem",
                  margin: 0,
                  color: "#2d3a7b",
                }}
              >
                {requestCardHeading(names[index])}
              </h2>
              <blockquote
                style={{
                  margin: 0,
                  padding: "1rem 1.25rem",
                  borderLeft: "3px solid #c9d2f0",
                  borderRadius: "0.25rem",
                  background: "#fbfcff",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "1.1rem",
                  lineHeight: 1.6,
                  color: "#333",
                  // The request is free text; keep the author's line breaks.
                  whiteSpace: "pre-wrap",
                }}
              >
                {partner.request}
              </blockquote>
            </article>
          </li>
        ))}
      </ol>

      <p style={{ color: "#555", margin: 0, lineHeight: 1.5 }}>
        {RETURN_COPY.pairedFooter}
      </p>
    </div>
  );
}
