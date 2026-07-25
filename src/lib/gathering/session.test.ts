import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken } from "@/lib/gathering/session";

describe("participant sessions", () => {
  it("creates high-entropy URL-safe tokens and stores stable digests", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
  });
});
