import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDatabase: vi.fn(() => ({}) as never),
}));

vi.mock("@/lib/repository", () => ({
  findSessionBySetupPath: vi.fn(),
  countSubmissions: vi.fn(),
}));

import { countSubmissions, findSessionBySetupPath } from "@/lib/repository";

import { GET } from "./route";

const SLUG = "test-setup-slug";

function get(path: string) {
  return GET(new Request(`http://localhost/api/setup/${path}/count`), {
    params: Promise.resolve({ path }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ORGANIZER_SETUP_PATH = SLUG;
});

afterEach(() => {
  delete process.env.ORGANIZER_SETUP_PATH;
});

describe("GET /api/setup/[path]/count", () => {
  it("404s for a path that is not the configured setup slug (count only lives at the unguessable path)", async () => {
    const response = await get("guessed-path");

    expect(response.status).toBe(404);
    // The unknown-path guard must short-circuit before any database lookup.
    expect(findSessionBySetupPath).not.toHaveBeenCalled();
    expect(countSubmissions).not.toHaveBeenCalled();
  });

  it("404s at the valid path before the session has been created", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue(null);

    const response = await get(SLUG);

    expect(response.status).toBe(404);
    expect(countSubmissions).not.toHaveBeenCalled();
  });

  it("returns the bare submission count for the configured path", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue({
      id: "sess_1",
    } as never);
    vi.mocked(countSubmissions).mockResolvedValue(7);

    const response = await get(SLUG);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 7 });
    expect(countSubmissions).toHaveBeenCalledWith(expect.anything(), "sess_1");
  });
});
