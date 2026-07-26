import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { OrganizerSnapshot } from "@/lib/gathering/types";

export async function updateOrganizer(
  endpoint: "/api/organizer/launch" | "/api/organizer/reset",
): Promise<OrganizerSnapshot> {
  const response = await fetchWithTimeout(endpoint, { method: "POST" });
  const result = (await response.json().catch(() => null)) as
    (OrganizerSnapshot & { error?: string }) | null;

  if (!response.ok || !result) {
    throw new Error(result?.error ?? "The gathering could not be updated.");
  }

  return result;
}
