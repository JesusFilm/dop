import type { Metadata } from "next";
import { AdminSettings } from "@/components/organizer/admin-settings";

export const metadata: Metadata = {
  title: "Settings | Day of Prayer",
};

export default function AdminSettingsPage() {
  return <AdminSettings />;
}
