import { describe, expect, it } from "vitest";
import {
  decryptPrayerRequest,
  encryptPrayerRequest,
} from "@/lib/gathering/prayer-request-crypto";

const key = Buffer.alloc(32, 7).toString("base64");

describe("prayer request encryption", () => {
  it("round-trips without storing plaintext", () => {
    const encrypted = encryptPrayerRequest("Please pray for courage.", key);

    expect(encrypted.ciphertext).not.toContain("courage");
    expect(decryptPrayerRequest(encrypted, key)).toBe(
      "Please pray for courage.",
    );
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptPrayerRequest("Private request", key);

    expect(() =>
      decryptPrayerRequest(
        {
          ...encrypted,
          ciphertext: `${encrypted.ciphertext.slice(0, -2)}aa`,
        },
        key,
      ),
    ).toThrow();
  });

  it("requires a 32-byte base64 key", () => {
    expect(() => encryptPrayerRequest("Private request", "not-a-key")).toThrow(
      "PRAYER_REQUEST_ENCRYPTION_KEY",
    );
  });
});
