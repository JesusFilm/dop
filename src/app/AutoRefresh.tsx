"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RETURN_COPY } from "@/lib/return-view";

/**
 * Re-renders the current server route on a slow interval until the server
 * serves something else and unmounts this component.
 *
 * Used by the post-reveal "in just a moment" state (§7.3): the app clock has
 * opened the reveal but the write-once pairing freeze hasn't landed yet, so the
 * page must advance on its own rather than promising it will and then sitting
 * there until someone thinks to reload. Refreshing is all it does — the server,
 * against its own clock (§5), decides what the next render shows; the client
 * never unlocks partner content itself.
 *
 * **Giving up is visible.** The retries are bounded, and when the bound is spent
 * this renders the stalled copy plus a manual retry instead of nothing. Silently
 * stopping while the surrounding copy still said "this page will catch up on its
 * own" would strand a participant at the one moment the whole event turns on —
 * the copy-versus-behaviour drift
 * `docs/solutions/design-patterns/server-authoritative-time-gating.md` warns
 * about. The manual retry stays available afterwards for as many attempts as
 * someone wants to make, and it asks the same server the same question rather
 * than deciding anything client-side.
 */

/**
 * How often to ask the server for a fresh render. The gap this covers is
 * expected to be seconds (the freeze fires on the first trigger at/after the
 * reveal), so this is brisk enough to feel immediate and slow enough that a
 * roomful of phones at the reveal instant isn't a load problem.
 */
const REFRESH_INTERVAL_MS = 3000;

/**
 * How many refreshes to attempt before handing over to the participant —
 * roughly two minutes' worth. If the freeze hasn't landed by then it is not
 * coming on its own (the organizer's backstop button is the answer, §5), so
 * polling on forever from a roomful of phones buys nothing the visible retry
 * below doesn't buy better.
 */
const MAX_REFRESHES = 40;

export function AutoRefresh() {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_REFRESHES) {
        clearInterval(timer);
        setStalled(true);
        return;
      }
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  // The body copy lives here rather than in the server-rendered Notice because
  // it has to *change* when the retries stop, not accumulate a contradiction
  // underneath a sentence that still promises the page catches up on its own.
  // The first render — including the server's, and so a JavaScript-less client's
  // — is the not-stalled branch, so the ordinary copy is never missing.
  if (!stalled) {
    return <span style={{ lineHeight: 1.5 }}>{RETURN_COPY.pendingBody}</span>;
  }

  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        alignItems: "center",
      }}
    >
      <span style={{ lineHeight: 1.5 }}>{RETURN_COPY.pendingStalledBody}</span>
      <button
        type="button"
        onClick={() => router.refresh()}
        style={{
          padding: "0.7rem 1.25rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#fff",
          background: "#3b5bdb",
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        {RETURN_COPY.pendingRetryLabel}
      </button>
    </span>
  );
}
