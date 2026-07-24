import { describe, expect, it } from "vitest";

import {
  buildSessionInput,
  isSetupPathAllowed,
  originFromHeaders,
  SESSION_NAME,
  SETUP_TIME_ZONE,
  submissionUrl,
} from "@/lib/setup";

describe("buildSessionInput", () => {
  it("builds a create-session input from Monday's wall-clock form values", () => {
    const input = buildSessionInput(
      { date: "2026-07-27", openTime: "09:00", revealTime: "11:00" },
      "unguessable-slug",
    );

    expect(input).toEqual({
      name: SESSION_NAME,
      setupPath: "unguessable-slug",
      timeZone: SETUP_TIME_ZONE,
      opensAt: new Date("2026-07-26T21:00:00.000Z"),
      revealAt: new Date("2026-07-26T23:00:00.000Z"),
      purgeAfter: new Date("2026-07-27T18:00:00.000Z"),
    });
  });

  it("rejects a reveal time that is not after the open time (close = reveal, §5)", () => {
    expect(() =>
      buildSessionInput(
        { date: "2026-07-27", openTime: "11:00", revealTime: "11:00" },
        "slug",
      ),
    ).toThrow(/reveal.*after.*open/i);

    expect(() =>
      buildSessionInput(
        { date: "2026-07-27", openTime: "11:00", revealTime: "09:00" },
        "slug",
      ),
    ).toThrow(/reveal.*after.*open/i);
  });

  it("propagates a malformed-input error from the time parser", () => {
    expect(() =>
      buildSessionInput(
        { date: "not-a-date", openTime: "09:00", revealTime: "11:00" },
        "slug",
      ),
    ).toThrow(/date/i);
  });
});

describe("isSetupPathAllowed", () => {
  it("allows only the exact configured slug", () => {
    expect(isSetupPathAllowed("unguessable-slug", "unguessable-slug")).toBe(
      true,
    );
  });

  it("denies a mismatched path", () => {
    expect(isSetupPathAllowed("guess", "unguessable-slug")).toBe(false);
  });

  it("denies everything when no slug is configured", () => {
    expect(isSetupPathAllowed("anything", undefined)).toBe(false);
    expect(isSetupPathAllowed("anything", "")).toBe(false);
  });
});

describe("submissionUrl", () => {
  it("is the app origin root that a scanned QR opens", () => {
    expect(submissionUrl("https://dop.example.com")).toBe(
      "https://dop.example.com/",
    );
  });

  it("normalizes a trailing slash on the origin", () => {
    expect(submissionUrl("https://dop.example.com/")).toBe(
      "https://dop.example.com/",
    );
  });
});

describe("originFromHeaders", () => {
  it("prefers forwarded proto + host (Railway proxy)", () => {
    const headers = new Map([
      ["x-forwarded-proto", "https"],
      ["x-forwarded-host", "dop.example.com"],
      ["host", "internal:3000"],
    ]);
    expect(originFromHeaders((name) => headers.get(name) ?? null)).toBe(
      "https://dop.example.com",
    );
  });

  it("falls back to the plain host header and https", () => {
    const headers = new Map([["host", "dop.example.com"]]);
    expect(originFromHeaders((name) => headers.get(name) ?? null)).toBe(
      "https://dop.example.com",
    );
  });

  it("uses http for localhost so local QR scans work", () => {
    const headers = new Map([["host", "localhost:3000"]]);
    expect(originFromHeaders((name) => headers.get(name) ?? null)).toBe(
      "http://localhost:3000",
    );
  });

  it("returns null when there is no host to build an origin from", () => {
    expect(originFromHeaders(() => null)).toBeNull();
  });
});
