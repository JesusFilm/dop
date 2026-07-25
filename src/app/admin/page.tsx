import type { Metadata } from "next";
import { OrganizerDashboard } from "@/components/organizer/organizer-dashboard";
import { getOrganizerSnapshot } from "@/lib/gathering/service";

export const metadata: Metadata = {
  title: "Organizer portal | Day of Prayer",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return <OrganizerDashboard initialSnapshot={await getOrganizerSnapshot()} />;
}
