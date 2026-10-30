import { findAsset } from "@/lib/assets";
import { siteHost } from "@/lib/env";
import { loadJob } from "@/lib/job-service";
import { isPaid } from "@/lib/jobs";
import { buildShareImage } from "@/lib/share";
import { getStorage } from "@/lib/storage";
import { verifyShareToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed before/after composite for a paid job. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "missing_token" }, { status: 403 });

  const verified = verifyShareToken(token);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return Response.json({ error: "token_expired" }, { status: 410 });
    }
    return Response.json({ error: "invalid_token" }, { status: 403 });
  }

  const job = await loadJob(verified.jobId);
  if (!job || job.status === "expired") {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }
  if (!isPaid(job) || !job.originalKey) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const asset = findAsset(job, verified.styleId);
  if (!asset || asset.status !== "ready" || !asset.fullKey) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const storage = getStorage();
  const [original, portrait] = await Promise.all([
    storage.get(job.originalKey),
    storage.get(asset.fullKey),
  ]);
  if (!original || !portrait) {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }

  const jpeg = await buildShareImage({
    original,
    portrait,
    host: siteHost(),
  });

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition":
        'attachment; filename="haunted-portrait-before-after.jpg"',
      "cache-control": "no-store",
    },
  });
}
