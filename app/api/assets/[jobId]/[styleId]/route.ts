import { findAsset } from "@/lib/assets";
import { loadJob } from "@/lib/job-service";
import { isPaid } from "@/lib/jobs";
import { getSession } from "@/lib/sessions";
import { getStorage } from "@/lib/storage";
import { isStyleId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inline full-resolution asset. Only a paid session that owns the job may read
 * it; before payment this returns 403 and leaks nothing.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string; styleId: string }> },
): Promise<Response> {
  const { jobId, styleId } = await context.params;
  if (!isStyleId(styleId)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const job = await loadJob(jobId);
  if (!job) return Response.json({ error: "job_not_found" }, { status: 404 });
  if (job.status === "expired") {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }

  const sessionId = new URL(request.url).searchParams.get("session");
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session || session.jobId !== job.id || session.status !== "paid") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isPaid(job)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const asset = findAsset(job, styleId);
  if (!asset || asset.status !== "ready" || !asset.fullKey) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = await getStorage().get(asset.fullKey);
  if (!bytes) {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": "inline",
      "cache-control": "no-store",
    },
  });
}
