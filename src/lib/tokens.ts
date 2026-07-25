import { randomBytes, randomUUID } from "node:crypto";

/**
 * Server-only credential generators for a submission (§6, #8). Isolated from
 * the browser-safe {@link module:@/lib/submit} because they depend on
 * `node:crypto`, which must never enter the client bundle. Only the server
 * action imports these.
 */

/**
 * A device cookie value: one submission per `deviceToken` per session (§6). An
 * opaque random identifier — identity is the submission id, never this token.
 */
export function generateDeviceToken(): string {
  return randomUUID();
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_LENGTH = 6;

/**
 * A short, human-legible recovery code (#8) — the bearer credential shown once
 * at submit that restores the return view on any device. Drawn from an
 * unambiguous alphabet (no 0/O or 1/I) so it survives being read off a
 * screenshot — which is exactly how the confirmation screen (§7.2) tells people
 * to keep it.
 */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_LENGTH);
  let code = "";
  for (let i = 0; i < RECOVERY_LENGTH; i += 1) {
    code += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return code;
}
