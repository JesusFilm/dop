import { describe, expect, it } from "vitest";

import {
  isBeforeReveal,
  STARTER_CHIPS,
  SUBMIT_COPY,
  validateSubmissionForm,
} from "@/lib/submit";

describe("SUBMIT_COPY", () => {
  it("carries the locked §7.1 copy verbatim", () => {
    expect(SUBMIT_COPY.heading).toBe("Share something to pray for");
    expect(SUBMIT_COPY.intro).toBe(
      "This morning we're praying for one another. Write down what's on your heart — one other person will carry it with you.",
    );
    expect(SUBMIT_COPY.requestLabel).toBe("What would you like prayer for?");
    expect(SUBMIT_COPY.requestPlaceholder).toBe(
      "It doesn't need to be big or polished — a worry, a hope, someone you love, a decision you're facing.",
    );
    expect(SUBMIT_COPY.consent).toBe(
      "Just one person — the one you're paired with — will see your name and read this. It's never shown publicly, no one sees everyone's, and it's all deleted tomorrow.",
    );
    expect(SUBMIT_COPY.button).toBe("Share my request");
    expect(SUBMIT_COPY.finePrint).toBe(
      "Submissions close at the reveal time (11:00 on Monday).",
    );
  });
});

describe("STARTER_CHIPS", () => {
  it("exposes the six locked §7.1 chip labels in order", () => {
    expect(STARTER_CHIPS.map((chip) => chip.label)).toEqual([
      "Someone I love",
      "A decision I'm facing",
      "Something I'm worried about",
      "Something I'm thankful for",
      "My work",
      "My health",
    ]);
  });

  it("gives every chip a non-empty sentence starter to prefill", () => {
    for (const chip of STARTER_CHIPS) {
      expect(chip.starter.length).toBeGreaterThan(0);
    }
  });
});

describe("validateSubmissionForm", () => {
  it("trims and returns the three fields when all are present", () => {
    const result = validateSubmissionForm({
      firstName: "  Ada  ",
      lastName: " Lovelace ",
      request: "  Wisdom for a decision  ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        firstName: "Ada",
        lastName: "Lovelace",
        request: "Wisdom for a decision",
      },
    });
  });

  it("rejects a missing first name", () => {
    const result = validateSubmissionForm({
      firstName: "   ",
      lastName: "Lovelace",
      request: "A hope",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.firstName).toBeTruthy();
      expect(result.fieldErrors.lastName).toBeUndefined();
      expect(result.fieldErrors.request).toBeUndefined();
    }
  });

  it("rejects a missing last name (both name fields required, #13)", () => {
    const result = validateSubmissionForm({
      firstName: "Ada",
      lastName: "",
      request: "A hope",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.lastName).toBeTruthy();
    }
  });

  it("rejects a missing request", () => {
    const result = validateSubmissionForm({
      firstName: "Ada",
      lastName: "Lovelace",
      request: "  ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.request).toBeTruthy();
    }
  });

  it("reports every empty field at once", () => {
    const result = validateSubmissionForm({
      firstName: "",
      lastName: "",
      request: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual([
        "firstName",
        "lastName",
        "request",
      ]);
    }
  });

  it("coerces non-string FormData values to empty and rejects them", () => {
    const result = validateSubmissionForm({
      firstName: undefined,
      lastName: null,
      request: undefined,
    });

    expect(result.ok).toBe(false);
  });
});

describe("isBeforeReveal", () => {
  const revealAt = new Date("2026-07-26T23:00:00.000Z");

  it("is true strictly before the reveal instant", () => {
    expect(isBeforeReveal(new Date("2026-07-26T22:59:59.999Z"), revealAt)).toBe(
      true,
    );
  });

  it("is false at the reveal instant (close = reveal)", () => {
    expect(isBeforeReveal(revealAt, revealAt)).toBe(false);
  });

  it("is false after the reveal instant", () => {
    expect(isBeforeReveal(new Date("2026-07-26T23:00:00.001Z"), revealAt)).toBe(
      false,
    );
  });
});
