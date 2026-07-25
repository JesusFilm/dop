import type { ReactNode } from "react";

import { RECOVERY_COPY } from "@/lib/recovery";

import { RecoveryForm } from "./RecoveryForm";

/**
 * The graceful **no-cookie / no-code** state (§7.3, §7.4): the message a visitor
 * gets when this phone holds no entry — "you're probably on a different phone;
 * enter your recovery code, or find an organizer" — with the entry form right
 * there so recovering is one step, not a navigation.
 *
 * There is deliberately **no name-lookup fallback** (§7.3): a code or nothing.
 * Losing both the cookie and the code is an accepted limitation, handled
 * informally in the room (§7.4), which is what `children` is for — the caller
 * adds whatever context that surface needs (e.g. that submissions have closed).
 */
export function RecoveryPanel({ children }: { children?: ReactNode }) {
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
      <h1 style={{ fontSize: "1.3rem", margin: 0 }}>{RECOVERY_COPY.heading}</h1>
      <p style={{ color: "#555", margin: 0, lineHeight: 1.5 }}>
        {RECOVERY_COPY.body}
      </p>
      {children}
      <RecoveryForm />
    </section>
  );
}
