import { createHmac, timingSafeEqual } from "node:crypto";

import { downloadSecret } from "@/lib/env";

export const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

interface TokenPayload {
  j: string;
  k: string;
  e: number;
}

export type VerifiedToken =
  | { ok: true; jobId: string; key: string; exp: number }
  | { ok: false; reason: "invalid" | "expired" };

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signature(payload: string): string {
  return createHmac("sha256", downloadSecret()).update(payload).digest("base64url");
}

export function signDownloadToken(input: {
  jobId: string;
  key: string;
  exp: number;
}): string {
  const payload: TokenPayload = { j: input.jobId, k: input.key, e: input.exp };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyDownloadToken(
  token: string,
  now: number = Date.now(),
): VerifiedToken {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return { ok: false, reason: "invalid" };

  const expected = signature(encoded);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
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
  return { ok: true, jobId: payload.j, key: payload.k, exp: payload.e };
}
