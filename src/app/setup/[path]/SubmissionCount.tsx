"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 5_000;

/**
 * The live submission count (§7.5, #8) — the organizer's only day-of dashboard.
 * Polls the count endpoint, which returns a bare number and never request
 * content (Privacy #3). Seeded with the server-rendered count so there is no
 * empty flash on load.
 */
export function SubmissionCount({
  path,
  initialCount,
}: {
  path: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch(`/api/setup/${path}/count`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data: { count?: number } = await response.json();
        if (active && typeof data.count === "number") {
          setCount(data.count);
        }
      } catch {
        // Transient network error — keep the last known count and retry.
      }
    }

    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path]);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "3rem", fontWeight: 700, lineHeight: 1 }}>
        {count}
      </div>
      <div style={{ color: "#555", fontSize: "0.95rem" }}>
        {count === 1 ? "submission" : "submissions"} so far
      </div>
    </div>
  );
}
