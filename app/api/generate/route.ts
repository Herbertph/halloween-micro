import { randomUUID } from "node:crypto";

import { siteHost } from "@/lib/env";
import { ApiError, apiErrorResponse, parseGenerateRequest } from "@/lib/api";
import { verifyCaptcha } from "@/lib/captcha";
import { runGeneration } from "@/lib/generation";
import { detectImageType, makePreview, stripMetadata } from "@/lib/images";
import { createJob, saveJob } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import { consumeDailyGeneration, consumePreviewAttempt } from "@/lib/limits";
import { clientIpHash } from "@/lib/request-ip";
import { incrementGenerations, incrementPreviews } from "@/lib/stats";
import { getStorage } from "@/lib/storage";
import { getImageProvider } from "@/lib/providers/image";
import type { Asset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generation currently runs inside this request (FR-12 deviation, issue #5) and
// can take one 60 s attempt plus one retry. Raise GENERATION_TIMEOUT_MS only
// after checking this bound; a real async job queue would remove this coupling.
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  try {
    const ipHash = clientIpHash(request);

    const input = await parseGenerateRequest(request, ipHash);
    if (!detectImageType(input.image)) {
      throw new ApiError("unsupported_format", 400);
    }

    // Turnstile runs before any quota or provider work. A rejection must not
    // consume the visitor's preview allowance.
    const captcha = await verifyCaptcha(input.turnstileToken);
    if (!captcha.ok) {
      if (captcha.reason === "captcha_timeout") {
        return Response.json({ error: "captcha_timeout" }, { status: 503 });
      }
      return Response.json({ error: "captcha_failed" }, { status: 400 });
    }

    // Decode and strip EXIF/GPS before any budget is consumed or anything is
    // stored: a corrupt image is a typed 4xx and must not burn the visitor's
    // preview allowance or the daily cap.
    let stripped: Buffer;
    try {
      stripped = await stripMetadata(input.image);
    } catch {
      throw new ApiError("invalid_image", 400);
    }

    const limit = await consumePreviewAttempt(ipHash);
    if (!limit.allowed) {
      return Response.json(
        {
          error: "rate_limited",
          retryAt: limit.retryAt.toISOString(),
        },
        { status: 429 },
      );
    }

    const cap = await consumeDailyGeneration();
    if (!cap.allowed) {
      return Response.json({ error: "capacity" }, { status: 429 });
    }

    const job = await createJob({ styleId: input.styleId, ipHash });
    const storage = getStorage();
    const originalKey = `blobs/${randomUUID()}.jpg`;
    await storage.put(originalKey, stripped, "image/jpeg");

    const generating = transition(job, "generating");
    generating.originalKey = originalKey;
    await saveJob(generating);

    const result = await runGeneration(
      { image: stripped, styleId: input.styleId },
      {
        provider: getImageProvider(),
        onAttempt: () => incrementGenerations(),
      },
    );

    if ("error" in result) {
      const failed = transition(generating, "failed");
      failed.error = result.error;
      failed.assets = [
        { styleId: input.styleId, status: "failed", error: result.error },
      ];
      await saveJob(failed);
      return Response.json(
        { jobId: failed.id, status: failed.status, error: result.error },
        { status: 200 },
      );
    }

    const preview = await makePreview(result.fullRes, siteHost());
    const fullKey = `blobs/${randomUUID()}.jpg`;
    const previewKey = `blobs/${randomUUID()}.jpg`;
    await Promise.all([
      storage.put(fullKey, result.fullRes, "image/jpeg"),
      storage.put(previewKey, preview, "image/jpeg"),
    ]);

    const ready = transition(generating, "preview_ready");
    ready.fullKey = fullKey;
    ready.previewKey = previewKey;
    const chosen: Asset = {
      styleId: input.styleId,
      status: "ready",
      fullKey,
      previewKey,
    };
    ready.assets = [chosen];
    await saveJob(ready);
    await incrementPreviews();

    return Response.json(
      {
        jobId: ready.id,
        status: ready.status,
        previewUrl: `/api/preview/${ready.id}`,
        expiresAt: ready.expiresAt,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return Response.json({ error: "fatal" }, { status: 500 });
  }
}
