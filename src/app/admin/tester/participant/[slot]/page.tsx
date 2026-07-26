import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  ParticipantExperience,
  type ParticipantEndpoints,
} from "@/components/participant/participant-experience";
import {
  parseTesterParticipantSlot,
  testerParticipantCookieName,
} from "@/lib/gathering/participant-session";
import { hashSessionToken } from "@/lib/gathering/session";
import { getParticipantSnapshot } from "@/lib/gathering/service";

export const metadata: Metadata = {
  title: "Tester participant | Day of Prayer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TesterParticipantPage({
  params,
}: {
  params: Promise<{ slot: string }>;
}) {
  const slot = parseTesterParticipantSlot((await params).slot);
  if (slot === null) notFound();

  const token = (await cookies()).get(testerParticipantCookieName(slot))?.value;
  const initialSnapshot = await getParticipantSnapshot(
    token ? hashSessionToken(token) : undefined,
  ).catch(() => ({ state: "JOIN", revision: 0 }) as const);
  const query = `?testerSession=${slot}`;
  const endpoints: ParticipantEndpoints = {
    snapshot: `/api/participant${query}`,
    leader: `/api/participant/leader${query}`,
    journeyAdvance: `/api/participant/journey/advance${query}`,
    journeyReassign: `/api/participant/journey/reassign${query}`,
  };

  return (
    <ParticipantExperience
      initialSnapshot={initialSnapshot}
      initialName={`Participant ${slot}`}
      endpoints={endpoints}
      homeHref={`/admin/tester/participant/${slot}`}
    />
  );
}
