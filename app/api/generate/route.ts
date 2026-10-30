import { randomUUID } from "node:crypto";

import { siteHost } from "@/lib/env";
import { ApiError, apiErrorResponse, parseGenerateRequest } from "@/lib/api";
import { runGeneration } from "@/lib/generation";
import { detectImageType, makePreview, stripMetadata } from "@/lib/images";
import { createJob, saveJob } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import { consumeDailyGeneration, consumePreviewAttempt } from "@/lib/limits";
import { clientIpHash } from "@/lib/request-ip";
import { getStorage } from "@/lib/storage";
import { getImageProvider } from "@/lib/providers/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const ipHash = clientIpHash(request);

    const input = await parseGenerateRequest(request, ipHash);
    if (!detectImageType(input.image)) {
      throw new ApiError("unsupported_format", 400);
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

    // Strip EXIF/GPS before anything is stored or sent to a provider.
    const stripped = await stripMetadata(input.image);
    const storage = getStorage();
    const originalKey = `blobs/${randomUUID()}.jpg`;
    await storage.put(originalKey, stripped, "image/jpeg");

    const generating = transition(job, "generating");
    generating.originalKey = originalKey;
    await saveJob(generating);

    const result = await runGeneration(
      { image: stripped, styleId: input.styleId },
      { provider: getImageProvider() },
    );

    if ("error" in result) {
      const failed = transition(generating, "failed");
      failed.error = result.error;
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
    await saveJob(ready);

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
