import { describe, expect, it } from "vitest";
import {
  assertSameOrigin,
  parseOptionalCapacity,
  readJsonObject,
} from "@/lib/gathering/http";

describe("gathering HTTP helpers", () => {
  it("accepts mutations from the request host", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://prayer.example/api/participant", {
          headers: { Host: "prayer.example", Origin: "https://prayer.example" },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a forged forwarded host", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://prayer.example/api/participant", {
          headers: {
            Host: "prayer.example",
            Origin: "https://attacker.example",
            "X-Forwarded-Host": "attacker.example",
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ORIGIN" }));
  });

  it("rejects malformed and oversized JSON", async () => {
    await expect(
      readJsonObject(
        new Request("https://prayer.example/api/participant", {
          method: "POST",
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(
      readJsonObject(
        new Request("https://prayer.example/api/participant", {
          method: "POST",
          body: JSON.stringify({ value: "x".repeat(4_096) }),
        }),
      ),
    ).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
  });

  it("stops reading a streamed body once it exceeds the limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3_000));
        controller.enqueue(new Uint8Array(2_000));
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(
      readJsonObject(
        new Request("https://prayer.example/api/participant", {
          method: "POST",
          body,
          duplex: "half",
        } as RequestInit),
      ),
    ).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
    expect(cancelled).toBe(true);
  });

  it("parses only valid optional capacities", () => {
    expect(parseOptionalCapacity(null)).toBeNull();
    expect(parseOptionalCapacity(12)).toBe(12);
    expect(() => parseOptionalCapacity(0)).toThrowError(
      expect.objectContaining({ code: "INVALID_CAPACITY" }),
    );
  });
});
