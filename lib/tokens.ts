import { createHmac, timingSafeEqual } from "node:crypto";

import { downloadSecret } from "@/lib/env";

export const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

interface TokenPayload {
  j: string;
  k: string;
  e: number;
  /** Style bound to the asset token (absent on increment 1 tokens). */
  s?: string;
}

interface SharePayload {
  j: string;
  s: string;
  e: number;
}

export type VerifiedToken =
  | { ok: true; jobId: string; key: string; exp: number; styleId?: string }
  | { ok: false; reason: "invalid" | "expired" };

export type VerifiedShareToken =
  | { ok: true; jobId: string; styleId: string; exp: number }
  | { ok: false; reason: "invalid" | "expired" };

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signature(payload: string): string {
  return createHmac("sha256", downloadSecret()).update(payload).digest("base64url");
}

function signatureFor(context: string, payload: string): string {
  return createHmac("sha256", downloadSecret())
    .update(`${context}:${payload}`)
    .digest("base64url");
}

function safeEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export function signDownloadToken(input: {
  jobId: string;
  key: string;
  exp: number;
  styleId?: string;
}): string {
  const payload: TokenPayload = {
    j: input.jobId,
    k: input.key,
    e: input.exp,
    ...(input.styleId ? { s: input.styleId } : {}),
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyDownloadToken(
  token: string,
  now: number = Date.now(),
): VerifiedToken {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return { ok: false, reason: "invalid" };
  if (!safeEqual(provided, signature(encoded))) {
    return { ok: false, reason: "invalid" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    typeof payload.j !== "string" ||
    typeof payload.k !== "string" ||
    typeof payload.e !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (payload.e <= now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    jobId: payload.j,
    key: payload.k,
    exp: payload.e,
    ...(typeof payload.s === "string" ? { styleId: payload.s } : {}),
  };
}

/**
 * Share tokens live in a separate signing context, so a download token can
 * never be replayed against /api/share (or the other way round).
 */
export function signShareToken(input: {
  jobId: string;
  styleId: string;
  exp: number;
}): string {
  const payload: SharePayload = { j: input.jobId, s: input.styleId, e: input.exp };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signatureFor("share", encoded)}`;
}

export function verifyShareToken(
  token: string,
  now: number = Date.now(),
): VerifiedShareToken {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return { ok: false, reason: "invalid" };
  if (!safeEqual(provided, signatureFor("share", encoded))) {
    return { ok: false, reason: "invalid" };
  }

  let payload: SharePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    typeof payload.j !== "string" ||
    typeof payload.s !== "string" ||
    typeof payload.e !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (payload.e <= now) return { ok: false, reason: "expired" };
  return { ok: true, jobId: payload.j, styleId: payload.s, exp: payload.e };
}
