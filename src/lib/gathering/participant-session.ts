import { PARTICIPANT_COOKIE } from "@/lib/gathering/constants";
import { GatheringError } from "@/lib/gathering/errors";

export const TESTER_PARTICIPANT_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export type TesterParticipantSlot = (typeof TESTER_PARTICIPANT_SLOTS)[number];

export function parseTesterParticipantSlot(
  value: string,
): TesterParticipantSlot | null {
  if (!/^[1-6]$/.test(value)) return null;
  const slot = Number(value);
  return TESTER_PARTICIPANT_SLOTS.includes(slot as TesterParticipantSlot)
    ? (slot as TesterParticipantSlot)
    : null;
}

export function testerParticipantCookieName(
  slot: TesterParticipantSlot,
): string {
  return `${PARTICIPANT_COOKIE}-tester-${slot}`;
}

export function participantCookieName(request: Request): string {
  const testerSession = new URL(request.url).searchParams.get("testerSession");
  if (testerSession === null) return PARTICIPANT_COOKIE;

  const slot = parseTesterParticipantSlot(testerSession);
  if (slot === null) {
    throw new GatheringError(
      "This tester participant session is invalid.",
      "INVALID_TESTER_SESSION",
    );
  }

  return testerParticipantCookieName(slot);
}
