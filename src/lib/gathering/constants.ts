export const ACTIVE_GATHERING_ID = "active";
export const PARTICIPANT_COOKIE = "day-of-prayer-participant";
export const PARTICIPANT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const INPUT_LIMITS = {
  participantName: 100,
  prayerRequest: 2_000,
  roomName: 100,
  roomDirections: 500,
} as const;
