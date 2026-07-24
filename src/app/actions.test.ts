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
  createSubmission: vi.fn(),
  updateSubmission: vi.fn(),
}));

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSubmission,
  findCurrentSession,
  findSubmissionByDeviceToken,
  updateSubmission,
} from "@/lib/repository";
import { DEVICE_TOKEN_COOKIE } from "@/lib/submit";

import { editAction, submitAction } from "./actions";
import { INITIAL_SUBMIT_STATE, type SubmitFormState } from "./submit-state";

const FUTURE_REVEAL = new Date("2999-01-01T00:00:00.000Z");
const PAST_REVEAL = new Date("2000-01-01T00:00:00.000Z");

function formOf(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const VALID_FORM = formOf({
  firstName: "Ada",
  lastName: "Lovelace",
  request: "wisdom for a decision",
});

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitAction", () => {
  it("returns a friendly message when no session exists yet", async () => {
    vi.mocked(cookies).mockResolvedValue(fakeCookies().store as never);
    vi.mocked(findCurrentSession).mockResolvedValue(null);

    const result = await submitAction(INITIAL_SUBMIT_STATE, VALID_FORM);

    expect(result.error).toMatch(/organizer/i);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it("refuses to record a submission after the reveal instant (hard close, §6)", async () => {
    vi.mocked(cookies).mockResolvedValue(fakeCookies().store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: PAST_REVEAL,
    } as never);

    const result = await submitAction(INITIAL_SUBMIT_STATE, VALID_FORM);

    expect(result.error).toMatch(/closed/i);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it("reports per-field errors and does not persist when fields are blank (#13)", async () => {
    vi.mocked(cookies).mockResolvedValue(fakeCookies().store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);

    const result = await submitAction(
      INITIAL_SUBMIT_STATE,
      formOf({ firstName: "", lastName: "", request: "" }),
    );

    expect(result.error).toBeNull();
    expect(result.fieldErrors).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      request: expect.any(String),
    });
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it("persists the submission, sets the device cookie, and redirects", async () => {
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(createSubmission).mockResolvedValue({ id: "sub_1" } as never);

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/");

    expect(createSubmission).toHaveBeenCalledTimes(1);
    const createArg = vi.mocked(createSubmission).mock.calls[0][1];
    expect(createArg).toMatchObject({
      sessionId: "sess_1",
      firstName: "Ada",
      lastName: "Lovelace",
      request: "wisdom for a decision",
    });
    // A device token and a recovery code are generated and persisted.
    expect(createArg.deviceToken).toBeTruthy();
    expect(createArg.recoveryCode).toBeTruthy();

    // The device cookie is set to the same token that was persisted.
    expect(cookieJar.setCalls).toHaveLength(1);
    expect(cookieJar.setCalls[0].name).toBe(DEVICE_TOKEN_COOKIE);
    expect(cookieJar.setCalls[0].value).toBe(createArg.deviceToken);
    expect(cookieJar.setCalls[0].options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("prevents a second submission from the same device (one per deviceToken, §6)", async () => {
    const cookieJar = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "device-abc",
    });
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue({
      id: "sub_1",
    } as never);

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/");

    expect(createSubmission).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("treats a P2002 race as already-submitted and redirects to the return view", async () => {
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(createSubmission).mockRejectedValue({ code: "P2002" });

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/");

    expect(cookieJar.setCalls).toHaveLength(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns a generic error (never a raw database error) on a non-P2002 failure", async () => {
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(createSubmission).mockRejectedValue(
      new Error("connection reset"),
    );

    const result: SubmitFormState = await submitAction(
      INITIAL_SUBMIT_STATE,
      VALID_FORM,
    );

    expect(result.error).toMatch(/went wrong/i);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("editAction", () => {
  it("errors when the device has no entry to edit", async () => {
    vi.mocked(cookies).mockResolvedValue(fakeCookies().store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);

    const result = await editAction(INITIAL_SUBMIT_STATE, VALID_FORM);

    expect(result.error).toMatch(/couldn't find/i);
    expect(updateSubmission).not.toHaveBeenCalled();
  });

  it("refuses edits after the reveal instant (locked, §6)", async () => {
    vi.mocked(cookies).mockResolvedValue(
      fakeCookies({ name: DEVICE_TOKEN_COOKIE, value: "device-abc" })
        .store as never,
    );
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: PAST_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue({
      id: "sub_1",
    } as never);

    const result = await editAction(INITIAL_SUBMIT_STATE, VALID_FORM);

    expect(result.error).toMatch(/locked/i);
    expect(updateSubmission).not.toHaveBeenCalled();
  });

  it("updates the returning participant's entry before reveal and redirects", async () => {
    vi.mocked(cookies).mockResolvedValue(
      fakeCookies({ name: DEVICE_TOKEN_COOKIE, value: "device-abc" })
        .store as never,
    );
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue({
      id: "sub_1",
    } as never);
    vi.mocked(updateSubmission).mockResolvedValue({ id: "sub_1" } as never);

    await expect(
      editAction(
        INITIAL_SUBMIT_STATE,
        formOf({
          firstName: "Grace",
          lastName: "Hopper",
          request: "an updated request",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/");

    expect(updateSubmission).toHaveBeenCalledWith(expect.anything(), {
      id: "sub_1",
      firstName: "Grace",
      lastName: "Hopper",
      request: "an updated request",
    });
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
