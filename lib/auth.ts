import { SignJWT, jwtVerify } from "jose";

/**
 * WIPAS — Website Inspector Password Authentication System.
 *
 * There is no account system here: no usernames, no registration, no
 * "login/logout". WIPAS is a single-password gate. A correct password
 * issues a signed, HTTP-only session cookie with a fixed expiration.
 * Locking WIPAS simply clears that cookie.
 */

export const WIPAS_COOKIE_NAME = "wipas_session";
export const WIPAS_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

function getSessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set or is too short. Set it in your environment before starting Website Inspector."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createWipasSessionToken(): Promise<string> {
  const key = getSessionSecretKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ wipas: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + WIPAS_SESSION_TTL_SECONDS)
    .sign(key);
}

export async function verifyWipasSessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  try {
    const key = getSessionSecretKey();
    const { payload } = await jwtVerify(token, key);
    return payload.wipas === true;
  } catch {
    return false;
  }
}

export function checkInspectorPassword(candidate: string): boolean {
  const expected = process.env.INSPECTOR_PASSWORD;
  if (!expected) {
    throw new Error(
      "INSPECTOR_PASSWORD is not set. Add it to your environment (see .env.example) before starting Website Inspector."
    );
  }
  // Constant-time-ish comparison to reduce timing side channels.
  if (candidate.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
