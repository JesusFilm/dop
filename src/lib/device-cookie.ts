import { cookies } from "next/headers";

import { DEVICE_TOKEN_COOKIE } from "@/lib/submit";

/**
 * Writing the device cookie that resolves a participant's own entry (§6). Two
 * server-side callers set it and they must agree on the attributes, so the write
 * lives here once: the submit action (a fresh token for a new entry) and the
 * recovery action (adopting the token of the entry a recovery code unlocked,
 * §7.4). Server-only — it reaches for `next/headers`.
 */

/** Two days covers the open→reveal window and the next-morning return (§10). */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 2;

/**
 * Sets the device cookie to `token`. `httpOnly` so the bearer value is never
 * readable from client script, and `secure` in production.
 */
export async function setDeviceCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}
