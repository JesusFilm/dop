import { describe, expect, it } from "vitest";

import { generateDeviceToken, generateRecoveryCode } from "@/lib/tokens";

describe("generateDeviceToken", () => {
  it("produces a distinct, non-empty token each call", () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();

    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe("generateRecoveryCode", () => {
  it("produces a 6-char code from the unambiguous alphabet (no 0/O/1/I)", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateRecoveryCode()).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
      );
    }
  });
});
