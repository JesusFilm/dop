import type { Metadata } from "next";
import { ParticipantTester } from "@/components/organizer/participant-tester";

export const metadata: Metadata = {
  title: "Participant tester | Day of Prayer",
  robots: { index: false, follow: false },
};

export default function AdminTesterPage() {
  return <ParticipantTester />;
}
