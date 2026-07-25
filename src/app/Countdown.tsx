"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { formatCountdown } from "@/lib/reveal";

/**
 * A live countdown to the organizer-set reveal instant (§5, §7.3, #20), shown on
 * pre-reveal surfaces so a participant sees exactly how long until they can view
 * who they're praying for.
 *
 * **App-clock authoritative.** The server computes the remaining gap against
 * its own clock (`initialRemainingMs`, via {@link msUntilReveal}) and passes it
 * in; the component ticks by measuring *elapsed* time since mount, so a phone
 * whose wall clock is wrong cannot shift the displayed reveal moment — only the
 * (negligible) drift in the device's tick rate matters. When the countdown
 * reaches zero it asks the server to re-render via {@link useRouter.refresh},
 * letting the app clock — the sole authority — decide what to serve next (reveal
 * view or a hard-closed notice), rather than the client unlocking content on its
 * own.
 *
 * **What the retry covers.** The refresh is re-attempted on a slow cadence while
 * the screen is still pre-reveal, which rescues the case where a refresh
 * *succeeds* but the server has not swapped the view yet — a stale or lost
 * round-trip leaves the display at 0:00 until the next attempt lands, and the
 * one that lands unmounts this component. It does **not** rescue a refresh that
 * outright fails: on a non-OK response or a thrown fetch (the phone is offline),
 * Next abandons the soft refresh and performs a full document navigation
 * instead. So a hard failure at the boundary is not a frozen 0:00 — it is a page
 * load, which online nobody notices and offline replaces the screen with the
 * browser's error page. That matters on a surface holding something the
 * participant still needs, like the recovery code on `/confirmed`. See
 * `docs/solutions/design-patterns/server-authoritative-time-gating.md`.
 */

/** How often the countdown recomputes and repaints, in milliseconds. */
const TICK_INTERVAL_MS = 1000;

/**
 * How often to re-attempt the reveal `router.refresh()` once the countdown has
 * reached zero but the server hasn't yet swapped in the reveal view (a stale or
 * lost round-trip — an outright failure navigates instead of retrying, see the
 * component docstring). Slow enough not to hammer the server, brief enough that
 * a recovering network advances the participant within a few seconds.
 */
const REVEAL_REFRESH_RETRY_MS = 3000;

export function Countdown({
  initialRemainingMs,
  label = "Reveal in",
}: {
  /**
   * Milliseconds until the reveal, computed server-side against the app clock
   * ({@link msUntilReveal}) — the countdown's authoritative anchor.
   */
  initialRemainingMs: number;
  /** Leading label; defaults to "Reveal in". */
  label?: string;
}) {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs);

  useEffect(() => {
    // `performance.now()` is monotonic — immune to the device clock being
    // adjusted mid-countdown — so elapsed time is measured, not decremented.
    const startedAt = performance.now();
    // Elapsed reading of the last refresh attempt; -Infinity so the first
    // zero-crossing fires immediately, then retries pace at the retry interval.
    let lastRefreshAt = Number.NEGATIVE_INFINITY;

    function tick() {
      const elapsed = performance.now() - startedAt;
      const next = Math.max(0, initialRemainingMs - elapsed);
      setRemainingMs(next);
      if (next <= 0 && elapsed - lastRefreshAt >= REVEAL_REFRESH_RETRY_MS) {
        // The gate is the server's to open: re-render so the app clock decides
        // what comes next, rather than unlocking content client-side. Keep the
        // interval running and retry on a slow cadence — a refresh that serves
        // the reveal view unmounts us (cleanup stops the retries), and one that
        // returns pre-reveal content is re-attempted. A refresh that outright
        // fails never reaches this retry: Next turns it into a full document
        // load (see the docstring).
        lastRefreshAt = elapsed;
        router.refresh();
      }
    }

    const timer = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [initialRemainingMs, router]);

  return (
    <div
      role="timer"
      aria-live="off"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0.5rem",
        padding: "0.6rem 1rem",
        borderRadius: "999px",
        background: "#eef2ff",
        color: "#2d3a7b",
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{label}</span>
      <span
        style={{
          fontSize: "1.35rem",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.02em",
        }}
      >
        {formatCountdown(remainingMs)}
      </span>
    </div>
  );
}
