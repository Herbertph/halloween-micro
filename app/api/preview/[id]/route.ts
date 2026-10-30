import { loadJob } from "@/lib/job-service";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves only the watermarked preview object, never the full-resolution one. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const job = await loadJob(id);
  if (!job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }
  if (job.status === "expired") {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }
  if (!job.previewKey) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }

  const preview = await getStorage().get(job.previewKey);
  if (!preview) {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }

  return new Response(new Uint8Array(preview), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=60",
    },
  });
}
