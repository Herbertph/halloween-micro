import { createHmac, timingSafeEqual } from "node:crypto";

import { adminPassword, downloadSecret, siteUrl } from "@/lib/env";
import { getKv } from "@/lib/kv";

export const ADMIN_COOKIE = "hp_admin";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 60;

function sha256(value: string): Buffer {
  return createHmac("sha256", "admin-password").update(value).digest();
}

/** Timing-safe password comparison; an unset password always fails closed. */
export function passwordMatches(candidate: string): boolean {
  const configured = adminPassword();
  if (!configured || !candidate) return false;
  const left = sha256(candidate);
  const right = sha256(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}

function adminSignature(exp: number): string {
  return createHmac("sha256", downloadSecret())
    .update(`admin:${exp}`)
    .digest("base64url");
}

export function createAdminCookieValue(now: Date = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  return `${exp}.${adminSignature(exp)}`;
}

export function verifyAdminCookieValue(
  value: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!value) return false;
  const [expRaw, provided] = value.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Math.floor(now.getTime() / 1000)) {
    return false;
  }
  const expected = adminSignature(exp);
  const providedBuffer = Buffer.from(provided ?? "");
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function secureAttribute(): string | null {
  return siteUrl().startsWith("https://") ? "Secure" : null;
}

export function adminCookieHeader(value: string): string {
  return [
    `${ADMIN_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    secureAttribute(),
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

export function clearAdminCookieHeader(): string {
  return [
    `${ADMIN_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secureAttribute(),
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

export function cookieValue(
  cookieHeader: string | null | undefined,
  name = ADMIN_COOKIE,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/**
 * Five wrong attempts per IP per minute. The sixth attempt is refused with 429
 * before the password is even compared.
 */
export async function consumeLoginAttempt(
  ipHash: string,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const minute = Math.floor(now.getTime() / (LOGIN_WINDOW_SECONDS * 1000));
  const count = await getKv().incr(
    `admin:login:${ipHash}:${minute}`,
    LOGIN_WINDOW_SECONDS * 2,
  );
  return { allowed: count <= LOGIN_LIMIT };
}
