"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
 */

/**
 * How often to ask the server for a fresh render. The gap this covers is
 * expected to be seconds (the freeze fires on the first trigger at/after the
 * reveal), so this is brisk enough to feel immediate and slow enough that a
 * roomful of phones at the reveal instant isn't a load problem.
 */
const REFRESH_INTERVAL_MS = 3000;

/**
 * How many refreshes to attempt before giving up — roughly two minutes' worth.
 * The gap this covers should be seconds; if it hasn't closed by now the freeze
 * is not coming on its own (the organizer's backstop button is the answer, §5),
 * and a roomful of phones polling a server forever is worse than a page that
 * needs a manual reload.
 */
const MAX_REFRESHES = 40;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_REFRESHES) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
