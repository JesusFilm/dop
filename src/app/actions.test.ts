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

  it("persists the submission, sets the device cookie, and redirects to the confirmation screen (§7.2)", async () => {
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(createSubmission).mockResolvedValue({ id: "sub_1" } as never);

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/confirmed");

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

    // The recovery code is only ever shown once, on the confirmation screen —
    // a fresh submission must land there, not back on the submit landing.
    expect(redirect).toHaveBeenCalledWith("/confirmed");
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

  it("treats a deviceToken-constraint P2002 as already-submitted and redirects to the return view", async () => {
    // A concurrent same-device submit: the cookie token is present but the
    // dedup read missed the row the racing request wrote, so the insert loses
    // the (sessionId, deviceToken) index.
    const cookieJar = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "device-abc",
    });
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue(null);
    vi.mocked(createSubmission).mockRejectedValue({
      code: "P2002",
      meta: { target: ["sessionId", "deviceToken"] },
    });

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/");

    // The cookie is set to the device's own token so the return view resolves.
    expect(cookieJar.setCalls).toHaveLength(1);
    expect(cookieJar.setCalls[0].value).toBe("device-abc");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("regenerates the recovery code and retries on a recoveryCode-constraint P2002 (no silent data loss)", async () => {
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    // First insert loses the (sessionId, recoveryCode) race; the retry wins.
    vi.mocked(createSubmission)
      .mockRejectedValueOnce({
        code: "P2002",
        meta: { target: ["sessionId", "recoveryCode"] },
      })
      .mockResolvedValueOnce({ id: "sub_1" } as never);

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/confirmed");

    // The submission was actually persisted on retry, with a freshly minted
    // recovery code each attempt — never treated as already-submitted.
    expect(createSubmission).toHaveBeenCalledTimes(2);
    const firstCode = vi.mocked(createSubmission).mock.calls[0][1].recoveryCode;
    const secondCode =
      vi.mocked(createSubmission).mock.calls[1][1].recoveryCode;
    expect(firstCode).toBeTruthy();
    expect(secondCode).toBeTruthy();
    expect(secondCode).not.toBe(firstCode);
    expect(cookieJar.setCalls).toHaveLength(1);
    expect(redirect).toHaveBeenCalledWith("/confirmed");
  });

  it("gives up with a generic error after exhausting recovery-code retries", async () => {
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(createSubmission).mockRejectedValue({
      code: "P2002",
      meta: { target: ["sessionId", "recoveryCode"] },
    });

    const result: SubmitFormState = await submitAction(
      INITIAL_SUBMIT_STATE,
      VALID_FORM,
    );

    expect(result.error).toMatch(/went wrong/i);
    expect(vi.mocked(createSubmission).mock.calls.length).toBeGreaterThan(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("retries an unknown-target P2002 and succeeds (adapter omitted meta.target)", async () => {
    // Some adapters report P2002 without `meta.target`. A fresh UUID token
    // cannot realistically collide, so an unknown target is read as retriable.
    const cookieJar = fakeCookies();
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(createSubmission)
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "sub_1" } as never);

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/confirmed");

    expect(createSubmission).toHaveBeenCalledTimes(2);
    expect(redirect).toHaveBeenCalledWith("/confirmed");
  });

  it("treats a persistent unknown-target P2002 on a reused token as a device race (return view)", async () => {
    // Cookie token reused + an unknown target that never clears: after retries
    // are exhausted this is most likely a genuine device race, so redirect to
    // the return view keyed on the device's own token.
    const cookieJar = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "device-abc",
    });
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue(null);
    vi.mocked(createSubmission).mockRejectedValue({ code: "P2002" });

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/");

    expect(cookieJar.setCalls).toHaveLength(1);
    expect(cookieJar.setCalls[0].value).toBe("device-abc");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("classifies a constraint-name-string P2002 target the same as the array form", async () => {
    // `meta.target` can be the constraint name string rather than a field
    // array; the deviceToken branch must still match by substring.
    const cookieJar = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "device-abc",
    });
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue(null);
    vi.mocked(createSubmission).mockRejectedValue({
      code: "P2002",
      meta: { target: "submissions_sessionId_deviceToken_key" },
    });

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/");

    // Matched the deviceToken branch on the first attempt — no retries.
    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(cookieJar.setCalls[0].value).toBe("device-abc");
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

  it("reuses the device's existing cookie token when it has no entry yet (prior attempt)", async () => {
    // Cookie present but no persisted submission for it (a prior attempt that
    // set the cookie but never wrote): the same token is reused, not re-minted.
    const cookieJar = fakeCookies({
      name: DEVICE_TOKEN_COOKIE,
      value: "device-abc",
    });
    vi.mocked(cookies).mockResolvedValue(cookieJar.store as never);
    vi.mocked(findCurrentSession).mockResolvedValue({
      id: "sess_1",
      revealAt: FUTURE_REVEAL,
    } as never);
    vi.mocked(findSubmissionByDeviceToken).mockResolvedValue(null);
    vi.mocked(createSubmission).mockResolvedValue({ id: "sub_1" } as never);

    await expect(
      submitAction(INITIAL_SUBMIT_STATE, VALID_FORM),
    ).rejects.toThrow("REDIRECT:/confirmed");

    const createArg = vi.mocked(createSubmission).mock.calls[0][1];
    expect(createArg.deviceToken).toBe("device-abc");
    expect(cookieJar.setCalls).toHaveLength(1);
    expect(cookieJar.setCalls[0].value).toBe("device-abc");
    expect(redirect).toHaveBeenCalledWith("/confirmed");
  });
});

describe("editAction", () => {
  it("returns the organizer message when no session exists yet", async () => {
    vi.mocked(cookies).mockResolvedValue(
      fakeCookies({ name: DEVICE_TOKEN_COOKIE, value: "device-abc" })
        .store as never,
    );
    vi.mocked(findCurrentSession).mockResolvedValue(null);

    const result = await editAction(INITIAL_SUBMIT_STATE, VALID_FORM);

    expect(result.error).toMatch(/organizer/i);
    expect(updateSubmission).not.toHaveBeenCalled();
  });

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

  it("reports per-field errors and does not update when fields are blank (#13)", async () => {
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

    const result = await editAction(
      INITIAL_SUBMIT_STATE,
      formOf({ firstName: "", lastName: "", request: "" }),
    );

    expect(result.error).toBeNull();
    expect(result.fieldErrors).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      request: expect.any(String),
    });
    expect(updateSubmission).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns a not-found message (not a raw error) when the entry is purged before the update (P2025)", async () => {
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
    vi.mocked(updateSubmission).mockRejectedValue({ code: "P2025" });

    const result: SubmitFormState = await editAction(
      INITIAL_SUBMIT_STATE,
      VALID_FORM,
    );

    expect(result.error).toMatch(/couldn't find/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error (never a raw database error) on a non-P2025 update failure", async () => {
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
    vi.mocked(updateSubmission).mockRejectedValue(
      new Error("connection reset"),
    );

    const result: SubmitFormState = await editAction(
      INITIAL_SUBMIT_STATE,
      VALID_FORM,
    );

    expect(result.error).toMatch(/went wrong/i);
    expect(redirect).not.toHaveBeenCalled();
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
