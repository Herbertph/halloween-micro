import { normalizeJob } from "@/lib/assets";
import { isPaid } from "@/lib/jobs";
import { loadJob } from "@/lib/job-service";
import { getStorage } from "@/lib/storage";
import { verifyDownloadToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "missing_token" }, { status: 403 });
  }

  const verified = verifyDownloadToken(token);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return Response.json({ error: "token_expired" }, { status: 410 });
    }
    return Response.json({ error: "invalid_token" }, { status: 403 });
  }

  const job = await loadJob(verified.jobId);
  if (!job || job.status === "expired" || !isPaid(job)) {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }

  // The token is per asset now; find the asset that owns this key. Increment 1
  // tokens without a style still match through the normalised chosen asset.
  const asset = (normalizeJob(job).assets ?? []).find(
    (candidate) =>
      candidate.fullKey === verified.key &&
      (!verified.styleId || candidate.styleId === verified.styleId),
  );
  if (!asset?.fullKey) {
    return Response.json({ error: "invalid_token" }, { status: 403 });
  }

  const full = await getStorage().get(asset.fullKey);
  if (!full) {
    return Response.json(
      {
        error: "job_expired",
        message: "This portrait has already been deleted.",
      },
      { status: 410 },
    );
  }

  const filename =
    job.assets && job.assets.length > 1
      ? `haunted-portrait-${asset.styleId}.jpg`
      : "haunted-portrait.jpg";

  return new Response(new Uint8Array(full), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
