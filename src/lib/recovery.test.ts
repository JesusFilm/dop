import { describe, expect, it } from "vitest";

import {
  normalizeRecoveryCode,
  RECOVERY_ALPHABET,
  RECOVERY_CODE_LENGTH,
  RECOVERY_COPY,
  validateRecoveryCode,
} from "@/lib/recovery";

describe("normalizeRecoveryCode", () => {
  it("upper-cases what someone typed in lower case", () => {
    expect(normalizeRecoveryCode("k7mp2q")).toBe("K7MP2Q");
  });

  it("strips the spaces and dashes people add when reading a code aloud", () => {
    expect(normalizeRecoveryCode(" K7M - P2Q ")).toBe("K7MP2Q");
  });

  it("returns an empty string for a non-string value", () => {
    expect(normalizeRecoveryCode(null)).toBe("");
    expect(normalizeRecoveryCode(undefined)).toBe("");
    expect(normalizeRecoveryCode(42)).toBe("");
  });
});

describe("validateRecoveryCode", () => {
  it("accepts a well-formed code, normalized", () => {
    expect(validateRecoveryCode(" k7m-p2q ")).toEqual({
      ok: true,
      code: "K7MP2Q",
    });
  });

  it("asks for a code when the field is blank", () => {
    const result = validateRecoveryCode("   ");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/enter/i);
  });

  it("rejects a code of the wrong length", () => {
    expect(validateRecoveryCode("K7MP2").ok).toBe(false);
    expect(validateRecoveryCode("K7MP2QQ").ok).toBe(false);
  });

  it("rejects characters the code alphabet never produces (0/O, 1/I)", () => {
    // The generator's alphabet deliberately omits these lookalikes, so a code
    // containing one was mistyped — say so rather than querying the database.
    expect(validateRecoveryCode("K7MP2O").ok).toBe(false);
    expect(validateRecoveryCode("K7MP20").ok).toBe(false);
    expect(validateRecoveryCode("K7MP2I").ok).toBe(false);
    expect(validateRecoveryCode("K7MP21").ok).toBe(false);
  });

  it("accepts every character of the generator alphabet", () => {
    for (const character of RECOVERY_ALPHABET) {
      const code = character.repeat(RECOVERY_CODE_LENGTH);
      expect(validateRecoveryCode(code)).toEqual({ ok: true, code });
    }
  });
});

describe("RECOVERY_COPY", () => {
  it("points a code-less visitor at their code or an organizer (§7.3, §7.4)", () => {
    const body = `${RECOVERY_COPY.heading} ${RECOVERY_COPY.body}`.toLowerCase();
    expect(body).toMatch(/different phone/);
    expect(body).toMatch(/recovery code/);
    expect(body).toMatch(/organizer/);
  });
});
