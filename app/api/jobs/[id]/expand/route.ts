import { expandJob } from "@/lib/expand";
import { loadJob, publicJobView } from "@/lib/job-service";
import { isPaid } from "@/lib/jobs";
import { getSession } from "@/lib/sessions";
import { isStyleId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One pack asset can take the same 60 s + retry budget as a preview.
export const maxDuration = 120;

/**
 * Claims and generates at most one pending pack asset. Only the owning paid
 * session may expand; the cron sweeper uses the same claim path.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const styleParam = url.searchParams.get("style");

  const job = await loadJob(id);
  if (!job) return Response.json({ error: "job_not_found" }, { status: 404 });
  if (job.status === "expired") {
    return Response.json({ error: "job_expired" }, { status: 410 });
  }

  const session = sessionId ? await getSession(sessionId) : null;
  if (!session || session.jobId !== job.id || session.status !== "paid") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isPaid(job)) {
    return Response.json({ error: "invalid_state" }, { status: 409 });
  }

  const styleId =
    typeof styleParam === "string" && isStyleId(styleParam) ? styleParam : undefined;
  const result = await expandJob(job.id, styleId ? { styleId } : {});
  if (!result.job) {
    return Response.json({ error: "job_not_found" }, { status: 404 });
  }

  return Response.json(
    { job: publicJobView(result.job, { paidOwner: true }) },
    { headers: { "cache-control": "no-store" } },
  );
}
