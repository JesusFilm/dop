import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `redirect()` throws internally (NEXT_REDIRECT) to abort rendering; model that
// here with a sentinel so we can both assert the target and stop control flow.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/db", () => ({
  getDatabase: vi.fn(() => ({}) as never),
}));

vi.mock("@/lib/repository", () => ({
  findSessionBySetupPath: vi.fn(),
  createSession: vi.fn(),
}));

import { redirect } from "next/navigation";

import { createSession, findSessionBySetupPath } from "@/lib/repository";

import { createSessionAction, type CreateSessionState } from "./actions";

const SLUG = "test-setup-slug";
const NO_ERROR: CreateSessionState = { error: null };

function formOf(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const VALID_FORM = formOf({
  date: "2026-07-27",
  openTime: "09:00",
  revealTime: "11:00",
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ORGANIZER_SETUP_PATH = SLUG;
});

afterEach(() => {
  delete process.env.ORGANIZER_SETUP_PATH;
});

describe("createSessionAction", () => {
  it("rejects a path that is not the configured setup slug without touching the database", async () => {
    const result = await createSessionAction(
      "guessed-path",
      NO_ERROR,
      VALID_FORM,
    );

    expect(result).toEqual({ error: "This setup link is not valid." });
    expect(findSessionBySetupPath).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("redirects to the read-only view when a session already exists (create-once)", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue({
      id: "sess_1",
    } as never);

    await expect(
      createSessionAction(SLUG, NO_ERROR, VALID_FORM),
    ).rejects.toThrow(`REDIRECT:/setup/${SLUG}`);

    expect(redirect).toHaveBeenCalledWith(`/setup/${SLUG}`);
    // The existing session is never overwritten.
    expect(createSession).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error from the time parser instead of throwing", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue(null);

    const result = await createSessionAction(
      SLUG,
      NO_ERROR,
      formOf({ date: "not-a-date", openTime: "09:00", revealTime: "11:00" }),
    );

    expect(result.error).toMatch(/date/i);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("creates the single session from the form's wall-clock values then redirects", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue(null);
    vi.mocked(createSession).mockResolvedValue({ id: "sess_1" } as never);

    await expect(
      createSessionAction(SLUG, NO_ERROR, VALID_FORM),
    ).rejects.toThrow(`REDIRECT:/setup/${SLUG}`);

    expect(createSession).toHaveBeenCalledWith(expect.anything(), {
      name: "Day of Prayer",
      setupPath: SLUG,
      timeZone: "Pacific/Auckland",
      opensAt: new Date("2026-07-26T21:00:00.000Z"),
      revealAt: new Date("2026-07-26T23:00:00.000Z"),
      purgeAfter: new Date("2026-07-27T18:00:00.000Z"),
    });
    expect(redirect).toHaveBeenCalledWith(`/setup/${SLUG}`);
  });

  it("treats a P2002 unique-constraint violation as a won race and redirects (create-once backstop)", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue(null);
    // A concurrent create won first; the setupPath unique index rejects ours.
    vi.mocked(createSession).mockRejectedValue({ code: "P2002" });

    await expect(
      createSessionAction(SLUG, NO_ERROR, VALID_FORM),
    ).rejects.toThrow(`REDIRECT:/setup/${SLUG}`);

    expect(redirect).toHaveBeenCalledWith(`/setup/${SLUG}`);
  });

  it("returns a generic error (never a raw database error) for a non-P2002 failure", async () => {
    vi.mocked(findSessionBySetupPath).mockResolvedValue(null);
    vi.mocked(createSession).mockRejectedValue(new Error("connection reset"));

    const result = await createSessionAction(SLUG, NO_ERROR, VALID_FORM);

    expect(result).toEqual({
      error: "Could not create the session. Please try again.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
