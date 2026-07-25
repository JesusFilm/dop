import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type EncryptedPrayerRequest = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function decodeKey(value: string | undefined): Buffer {
  if (!value) {
    throw new Error("PRAYER_REQUEST_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PRAYER_REQUEST_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  const canonical = key.toString("base64");
  const supplied = Buffer.from(value);
  const expected = Buffer.from(canonical);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new Error(
      "PRAYER_REQUEST_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return key;
}

export function validatePrayerRequestEncryptionKey(
  keyValue = process.env.PRAYER_REQUEST_ENCRYPTION_KEY,
): void {
  decodeKey(keyValue);
}

export function encryptPrayerRequest(
  plaintext: string,
  keyValue = process.env.PRAYER_REQUEST_ENCRYPTION_KEY,
): EncryptedPrayerRequest {
  const key = decodeKey(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptPrayerRequest(
  encrypted: EncryptedPrayerRequest,
  keyValue = process.env.PRAYER_REQUEST_ENCRYPTION_KEY,
): string {
  const key = decodeKey(keyValue);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
