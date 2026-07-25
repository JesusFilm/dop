import Link from "next/link";

import { RECOVERY_COPY } from "@/lib/recovery";

import { RecoveryPanel } from "../RecoveryPanel";

/**
 * The standalone recovery-code page (§7.4, #8). The panel is also rendered
 * inline on the landing page wherever a visitor has no entry on this phone, so
 * the common case needs no navigation; this route exists so the pre-reveal
 * submit screen — which must keep leading with the form — can still offer
 * "already shared your request on another phone?" as a link.
 *
 * No session lookup here: the action resolves the session and reports a
 * not-open session itself, so this page is pure copy plus the form.
 */
export const metadata = {
  title: "Restore your request",
};

export default function RecoverPage() {
  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "2rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <RecoveryPanel />
      <Link
        href="/"
        style={{ color: "#3b5bdb", fontSize: "0.9rem", textAlign: "center" }}
      >
        {RECOVERY_COPY.backLabel}
      </Link>
    </main>
  );
}
