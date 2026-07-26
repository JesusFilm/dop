"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { getJourneyCountdown } from "@/lib/journey/countdown";

export function Countdown({
  startedAt,
  recommendedSeconds,
  serverTime,
  compact = false,
}: {
  startedAt: string;
  recommendedSeconds: number;
  serverTime: string;
  compact?: boolean;
}) {
  const [countdown, setCountdown] = useState(() =>
    getJourneyCountdown(startedAt, recommendedSeconds, Date.parse(serverTime)),
  );

  useEffect(() => {
    const serverBaseline = Date.parse(serverTime);
    const monotonicBaseline = performance.now();
    let interval: number | undefined;
    let elapsed = false;
    const update = () => {
      const next = getJourneyCountdown(
        startedAt,
        recommendedSeconds,
        serverBaseline + performance.now() - monotonicBaseline,
      );
      elapsed = next.elapsed;
      setCountdown(next);
      if (elapsed && interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    update();
    if (!elapsed) {
      interval = window.setInterval(update, 1_000);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [recommendedSeconds, serverTime, startedAt]);

  return (
    <div
      role="timer"
      aria-live={countdown.elapsed ? "polite" : "off"}
      className={
        countdown.elapsed
          ? `inline-flex items-center gap-2 rounded-full bg-amber-50 font-semibold text-amber-900 ${
              compact ? "px-4 py-2 text-sm" : "px-5 py-3"
            }`
          : `inline-flex items-center gap-2 rounded-full bg-primary-faint font-semibold text-primary ${
              compact ? "px-4 py-2 text-sm" : "px-5 py-3"
            }`
      }
    >
      <Clock3 aria-hidden="true" className={compact ? "size-4" : "size-5"} />
      {compact && countdown.elapsed ? "Time reached" : countdown.label}
    </div>
  );
}
