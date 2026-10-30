export const STYLE_IDS = [
  "vampire",
  "zombie",
  "witch",
  "skeleton",
  "pumpkin",
] as const;

export type StyleId = (typeof STYLE_IDS)[number];

export const GENERATE_ERRORS = [
  "no_subject",
  "moderation",
  "transient",
  "timeout",
  "fatal",
] as const;

export type GenerateError = (typeof GENERATE_ERRORS)[number];

export type JobStatus =
  | "created"
  | "generating"
  | "preview_ready"
  | "failed"
  | "awaiting_payment"
  | "paid"
  | "unlocked"
  | "expired";

export interface PublicStyle {
  id: StyleId;
  name: string;
  description: string;
}

export interface Job {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: JobStatus;
  styleId: StyleId;
  ipHash: string;
  error?: GenerateError;
  originalKey?: string;
  fullKey?: string;
  previewKey?: string;
  sessionId?: string;
  paidAt?: string;
  unlockedAt?: string;
}

/**
 * The only job shape that may leave the server. It deliberately has no
 * storage keys: the full-resolution object key is never serialised.
 */
export interface PublicJob {
  id: string;
  status: JobStatus;
  styleId: StyleId;
  createdAt: string;
  expiresAt: string;
  previewUrl?: string;
  downloadUrl?: string;
  error?: GenerateError;
}

export type ApiErrorCode =
  | "consent_required"
  | "file_missing"
  | "file_too_large"
  | "unsupported_format"
  | "invalid_style"
  | "rate_limited"
  | "capacity"
  | "job_not_found"
  | "job_expired"
  | "invalid_state"
  | "payment_declined"
  | "invalid_request";

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && STYLE_IDS.includes(value as StyleId);
}
