import { getKv } from "@/lib/kv";
import { isPaid, transition } from "@/lib/jobs";
import { loadJob, saveJob } from "@/lib/job-service";
import { getPaymentsProvider } from "@/lib/providers/payments";
import { PAYMENT_COMPLETED_EVENT } from "@/lib/providers/payments/types";
import { setSessionStatus } from "@/lib/sessions";

const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

function ignored(reason: string): Response {
  return Response.json({ received: true, ignored: reason });
}

/**
 * The single webhook path. Both POST /api/webhooks/payments and the mock
 * checkout's "Pay" action go through here, so signatures, idempotency and the
 * job transitions are enforced in exactly one place.
 */
export async function handlePaymentWebhook(
  request: Request,
  provider = getPaymentsProvider(),
): Promise<Response> {
  const body = await request.text();
  const parsed = await provider.parseWebhook({
    headers: request.headers,
    body,
  });

  if ("invalid" in parsed) {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
  if (parsed.type !== PAYMENT_COMPLETED_EVENT) return ignored("event_type");
  if (!parsed.jobId) return ignored("missing_job");

  const kv = getKv();
  const marker = `webhook:${parsed.eventId}`;
  if (await kv.get(marker)) return ignored("duplicate");

  const job = await loadJob(parsed.jobId);
  if (!job || job.status === "expired" || job.status === "failed") {
    return ignored("unknown_job");
  }

  if (!isPaid(job)) {
    let next = job;
    if (next.status === "preview_ready") {
      next = transition(next, "awaiting_payment");
    }
    if (next.status === "awaiting_payment") {
      next = transition(next, "paid");
    }
    if (next.status === "paid") {
      next = transition(next, "unlocked");
    }
    if (!isPaid(next)) return ignored("job_state");
    await saveJob(next);
  }

  await setSessionStatus(parsed.sessionId, "paid");
  await kv.set(marker, "1", { exSeconds: IDEMPOTENCY_TTL_SECONDS });
  return Response.json({ received: true });
}
