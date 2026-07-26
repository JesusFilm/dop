import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateOrganizer } from "./update-organizer";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

describe("updateOrganizer", () => {
  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockReset();
  });

  it("preserves a server-provided JSON error", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Launch is unavailable." }),
    } as unknown as Response);

    await expect(updateOrganizer("/api/organizer/launch")).rejects.toThrow(
      "Launch is unavailable.",
    );
  });

  it("uses a stable fallback for a non-JSON error response", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response);

    await expect(updateOrganizer("/api/organizer/reset")).rejects.toThrow(
      "The gathering could not be updated.",
    );
  });
});
