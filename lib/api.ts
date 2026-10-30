import type { NextRequest } from "next/server";

import type { ApiErrorCode, StyleId } from "@/lib/types";
import { isStyleId, STYLE_IDS } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function apiErrorResponse(error: ApiError): Response {
  return Response.json(
    { error: error.code, ...error.extra },
    { status: error.status },
  );
}

export interface GenerateInput {
  image: Buffer;
  styleId: StyleId;
}

export interface ParsedGenerateRequest extends GenerateInput {
  ipHash: string;
}

/**
 * Shared parse + validation for POST /api/generate. Kept out of the route so
 * unit tests can exercise it without HTTP.
 */
export async function parseGenerateRequest(
  request: Request,
  ipHash: string,
): Promise<ParsedGenerateRequest> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("invalid_request", 400);
  }

  const consent = form.get("consent");
  if (consent !== "true") {
    throw new ApiError("consent_required", 400);
  }

  const styleId = form.get("styleId");
  if (!isStyleId(styleId)) {
    throw new ApiError("invalid_style", 400, { styles: STYLE_IDS });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError("file_missing", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("file_too_large", 413, { maxBytes: MAX_UPLOAD_BYTES });
  }

  const image = Buffer.from(await file.arrayBuffer());
  return { image, styleId, ipHash };
}

export async function readJson<T>(request: NextRequest | Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("invalid_request", 400);
  }
}
