export type JourneyCountdown = {
  remainingSeconds: number;
  elapsed: boolean;
  label: string;
};

export function getJourneyCountdown(
  startedAt: string,
  recommendedSeconds: number,
  now = Date.now(),
): JourneyCountdown {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - Date.parse(startedAt)) / 1_000),
  );
  const remainingSeconds = Math.max(0, recommendedSeconds - elapsedSeconds);
  if (remainingSeconds === 0) {
    return {
      remainingSeconds,
      elapsed: true,
      label: "Recommended time reached",
    };
  }
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return {
    remainingSeconds,
    elapsed: false,
    label: `${minutes}:${String(seconds).padStart(2, "0")}`,
  };
}
