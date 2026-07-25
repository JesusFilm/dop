import { cookies } from "next/headers";
import { ParticipantExperience } from "@/components/participant/participant-experience";
import { PARTICIPANT_COOKIE } from "@/lib/gathering/constants";
import { hashSessionToken } from "@/lib/gathering/session";
import { getParticipantSnapshot } from "@/lib/gathering/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  const snapshot = await getParticipantSnapshot(
    token ? hashSessionToken(token) : undefined,
  );
  return <ParticipantExperience initialSnapshot={snapshot} />;
}
