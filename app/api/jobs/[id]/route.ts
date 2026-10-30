import { loadJob, publicJobView } from "@/lib/job-service";
import { getSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public job status. The download URL is only attached when the supplied
 * session belongs to this job and is paid; a job id alone never unlocks it.
 */
export async function GET(
  request: Request,
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

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  const session = sessionId ? await getSession(sessionId) : null;
  const ownsJob = Boolean(session && session.jobId === job.id);
  const paidOwner = ownsJob && session?.status === "paid";

  const view = publicJobView(job, { paidOwner });

  return Response.json(
    { job: view, payment: ownsJob ? session?.status : undefined },
    { headers: { "cache-control": "no-store" } },
  );
}
