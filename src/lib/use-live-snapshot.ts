"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const LIVE_POLL_INTERVAL_MS = 1_000;
const FAILED_POLL_INTERVAL_MS = 2_000;
const MAX_FAILED_POLL_INTERVAL_MS = 10_000;

export function getLiveSnapshotPollDelay(
  isDisconnected: boolean,
  failureCount: number,
) {
  return isDisconnected
    ? Math.min(
        MAX_FAILED_POLL_INTERVAL_MS,
        FAILED_POLL_INTERVAL_MS * failureCount,
      )
    : LIVE_POLL_INTERVAL_MS;
}

export function useLiveSnapshot<T extends { revision: number }>(
  initial: T,
  endpoint: string,
) {
  const [snapshot, setSnapshot] = useState(initial);
  const [isDisconnected, setDisconnected] = useState(false);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("Snapshot request failed");
      const next = (await response.json()) as T;
      setSnapshot((current) =>
        next.revision <= current.revision ? current : next,
      );
      setDisconnected(false);
      failures.current = 0;
      return next;
    } catch {
      failures.current += 1;
      setDisconnected(true);
      return null;
    }
  }, [endpoint]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function poll() {
      if (!stopped && document.visibilityState === "visible") {
        await refresh();
      }
      if (!stopped) {
        const delay = getLiveSnapshotPollDelay(
          isDisconnected,
          failures.current,
        );
        timeout = setTimeout(poll, delay);
      }
    }

    timeout = setTimeout(
      poll,
      getLiveSnapshotPollDelay(isDisconnected, failures.current),
    );
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDisconnected, refresh]);

  return { snapshot, setSnapshot, refresh, isDisconnected };
}
