import { RECOVERY_COPY } from "@/lib/recovery";

import { RecoveryForm } from "./RecoveryForm";

/**
 * The graceful **no-cookie / no-code** state (§7.3, §7.4): the message a visitor
 * gets when this phone holds no entry — "you're probably on a different phone;
 * enter your recovery code, or find an organizer" — with the entry form right
 * there so recovering is one step, not a navigation.
 *
 * The heading is the caller's to set, because the two surfaces that show this
 * panel are true about different things. On `/recover` the recovery guess *is*
 * the situation, so the default heading leads. But a latecomer who reaches the
 * post-reveal landing page never submitted at all — for them the true headline
 * is the §6 hard cutoff, and recovery is the offer underneath it. Leading that
 * screen with "you're probably on a different phone" would state something the
 * page cannot know.
 *
 * There is deliberately **no name-lookup fallback** (§7.3): a code or nothing.
 * Losing both the cookie and the code is an accepted limitation, handled
 * informally in the room (§7.4).
 */
export function RecoveryPanel({
  heading = RECOVERY_COPY.heading,
  lead,
}: {
  /** Defaults to the "different phone" guess; override where it isn't true. */
  heading?: string;
  /** An optional line above the recovery copy, e.g. the hard-cutoff notice. */
  lead?: string;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "1.25rem",
        border: "1px solid #e2e6f5",
        borderRadius: "0.75rem",
        background: "#fbfcff",
        textAlign: "left",
      }}
    >
      {/* The panel's heading is the primary heading on both surfaces that use
          it — the post-reveal landing state and the /recover page — so it is an
          h1 rather than a section heading under one. */}
      <h1 style={{ fontSize: "1.3rem", margin: 0 }}>{heading}</h1>
      {lead ? (
        <p style={{ color: "#555", margin: 0, lineHeight: 1.5 }}>{lead}</p>
      ) : null}
      <p style={{ color: "#555", margin: 0, lineHeight: 1.5 }}>
        {RECOVERY_COPY.body}
      </p>
      <RecoveryForm />
    </section>
  );
}
