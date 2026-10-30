import { ApiError, apiErrorResponse, readJson } from "@/lib/api";
import { priceCents } from "@/lib/env";
import { loadJob, saveJob } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import { getPaymentsProvider } from "@/lib/providers/payments";
import { createSessionRecord } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson<{ jobId?: unknown }>(request);
    if (typeof body.jobId !== "string") {
      throw new ApiError("invalid_request", 400);
    }

    const job = await loadJob(body.jobId);
    if (!job) throw new ApiError("job_not_found", 404);
    if (job.status === "expired") throw new ApiError("job_expired", 410);
    // A declined session leaves the job in awaiting_payment, so that state may
    // open a fresh session; nothing else may.
    if (job.status !== "preview_ready" && job.status !== "awaiting_payment") {
      throw new ApiError("invalid_state", 409);
    }

    const amountCents = priceCents();
    const session = await getPaymentsProvider().createSession({
      jobId: job.id,
      amountCents,
    });

    // Persist the local session mapping for both providers, so /success and the
    // webhook agreement work the same way with mock and Stripe session ids.
    await createSessionRecord({
      id: session.sessionId,
      jobId: job.id,
      amountCents,
    });

    const next =
      job.status === "preview_ready" ? transition(job, "awaiting_payment") : job;
    next.sessionId = session.sessionId;
    await saveJob(next);

    return Response.json({
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return Response.json({ error: "fatal" }, { status: 500 });
  }
}
