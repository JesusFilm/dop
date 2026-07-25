import { beforeEach, describe, expect, it, vi } from "vitest";

// `redirect()` throws internally (NEXT_REDIRECT) to abort; model that with a
// sentinel so we can both assert the target and stop control flow.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDatabase: vi.fn(() => ({}) as never),
}));

vi.mock("@/lib/repository", () => ({
  findCurrentSession: vi.fn(),
  findSubmissionByDeviceToken: vi.fn(),
  findSubmissionByRecoveryCode: vi.fn(),
}));

import { cookies } from "next/headers";

import {
  findCurrentSession,
  findSubmissionByDeviceToken,
  findSubmissionByRecoveryCode,
} from "@/lib/repository";
import { DEVICE_TOKEN_COOKIE } from "@/lib/submit";

import { recoverAction } from "./actions";
import { INITIAL_RECOVERY_STATE } from "./recovery-state";

const SESSION = {
  id: "session-1",
  revealAt: new Date("2026-07-26T23:00:00.000Z"),
} as never;

function formOf(code: string): FormData {
  const data = new FormData();
  data.set("recoveryCode", code);
  return data;
}

/** A fake Next cookie store; records the last `set` call for assertions. */
function fakeCookies(initial?: { name: string; value: string }) {
  const setCalls: Array<{ name: string; value: string; options: unknown }> = [];
  return {
    store: {
      get: vi.fn((name: string) =>
        initial && initial.name === name
          ? { name, value: initial.value }
          : undefined,
      ),
      set: vi.fn((name: string, value: string, options: unknown) => {
        setCalls.push({ name, value, options });
      }),
    },
    setCalls,
  };
}

function run(code: string) {
  return recoverAction(INITIAL_RECOVERY_STATE, formOf(code));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recoverAction", () => {
  it("returns a friendly message when no session exists yet", async () => {
    vi.mocked(findCurrentSession).mockResolvedValue(null);

    const state = await run("K7MP2Q");

    expect(state.error).toMatch(/isn't open yet/i);
    expect(findSubmissionByRecoveryCode).not.toHaveBeenCalled();
  });

  it("rejects a malformed code without touching the database", async () => {
    vi.mocked(findCurrentSession).mockResolvedValue(SESSION);
    const { store } = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(store as never);

    const state = await run("nope");

    expect(state.error).toBeTruthy();
    expect(findSubmissionByRecoveryCode).not.toHaveBeenCalled();
  });

  it("restores the entry on a new device by adopting its device token (§7.4)", async () => {
    vi.mocked(findCurrentSession).mockResolvedValue(SESSION);
    const { store, setCalls } = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(store as never);
    vi.mocked(findSubmissionByRecoveryCode).mockResolvedValue({
      id: "sub-1",
      deviceToken: "token-from-original-phone",
    } as never);

    await expect(run("k7m-p2q")).rejects.toThrow("REDIRECT:/");

    // Normalized before the lookup, so a lower-case/hyphenated typing works.
    expect(findSubmissionByRecoveryCode).toHaveBeenCalledWith(
      expect.anything(),
      "session-1",
      "K7MP2Q",
    );
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({
      name: DEVICE_TOKEN_COOKIE,
      value: "token-from-original-phone",
    });
  });

  it("reports an unknown code without saying whether it ever existed", async () => {
    vi.mocked(findCurrentSession).mockResolvedValue(SESSION);
    const { store, setCalls } = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(store as never);
    vi.mocked(findSubmissionByRecoveryCode).mockResolvedValue(null);

    const state = await run("K7MP2Q");

    expect(state.error).toMatch(/couldn't find/i);
    expect(setCalls).toEqual([]);
  });

  it("sends a device that already holds its own entry to the return view", async () => {
    // This phone has its own submission, so there is nothing to restore — and
    // overwriting its cookie would lose that entry. Show what it already has.
    vi.mocked(findCurrentSession).mockResolvedValue(SESSION);
    const { store, setCalls } = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "this-phones-token",
    });
    vi.mocked(cookies).mockResolvedValue(store as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue({
      id: "own-sub",
    } as never);

    await expect(run("K7MP2Q")).rejects.toThrow("REDIRECT:/");

    expect(findSubmissionByRecoveryCode).not.toHaveBeenCalled();
    expect(setCalls).toEqual([]);
  });

  it("still recovers when the device cookie is stale (its entry was purged)", async () => {
    vi.mocked(findCurrentSession).mockResolvedValue(SESSION);
    const { store, setCalls } = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "stale-token",
    });
    vi.mocked(cookies).mockResolvedValue(store as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue(null);
    vi.mocked(findSubmissionByRecoveryCode).mockResolvedValue({
      id: "sub-1",
      deviceToken: "token-from-original-phone",
    } as never);

    await expect(run("K7MP2Q")).rejects.toThrow("REDIRECT:/");

    expect(setCalls[0]).toMatchObject({
      value: "token-from-original-phone",
    });
  });

  it("recovers after the reveal too — the return view is the point (§7.4)", async () => {
    // Recovery is not gated on the reveal boundary: before it a participant
    // edits their request, after it they read who they're praying for. The
    // hard cutoff (§6) applies to writing submissions, not to restoring one.
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "session-1",
      revealAt: new Date("2000-01-01T00:00:00.000Z"),
    } as never);
    const { store, setCalls } = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(store as never);
    vi.mocked(findSubmissionByRecoveryCode).mockResolvedValue({
      id: "sub-1",
      deviceToken: "token-from-original-phone",
    } as never);

    await expect(run("K7MP2Q")).rejects.toThrow("REDIRECT:/");
    expect(setCalls).toHaveLength(1);
  });
});
