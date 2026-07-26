"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { getJourneyCountdown } from "@/lib/journey/countdown";

export function Countdown({
  startedAt,
  recommendedSeconds,
  serverTime,
}: {
  startedAt: string;
  recommendedSeconds: number;
  serverTime: string;
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
          ? "inline-flex items-center gap-2 rounded-full bg-amber-50 px-5 py-3 font-semibold text-amber-900"
          : "inline-flex items-center gap-2 rounded-full bg-primary-faint px-5 py-3 font-semibold text-primary"
      }
    >
      <Clock3 aria-hidden="true" className="size-5" />
      {countdown.label}
    </div>
  );
}
