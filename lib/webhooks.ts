import { applyProductToAssets, loadJob, saveJob } from "@/lib/job-service";
import { getSession, setSessionStatus } from "@/lib/sessions";
import { recordSale } from "@/lib/stats";
import { getKv } from "@/lib/kv";
import { isPaid, transition } from "@/lib/jobs";
import { getPaymentsProvider } from "@/lib/providers/payments";
import { PAYMENT_COMPLETED_EVENT } from "@/lib/providers/payments/types";
import { productPriceCents } from "@/lib/products";
import type { Product } from "@/lib/types";

const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

function ignored(reason: string): Response {
  return Response.json({ received: true, ignored: reason });
}

/**
 * The single webhook path. Both POST /api/webhooks/payments and the mock
 * checkout's "Pay" action go through here, so signatures, idempotency and the
 * job transitions are enforced in exactly one place. The product and amount
 * come from our own stored session record, never from the event payload.
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
  // Claim the event atomically before any side effect. A concurrent delivery
  // loses this SET NX and is ignored, so the sale can only be recorded once.
  const claimed = await kv.setIfAbsent(
    marker,
    "processing",
    IDEMPOTENCY_TTL_SECONDS,
  );
  if (!claimed) return ignored("duplicate");

  try {
    const job = await loadJob(parsed.jobId);
    if (!job || job.status === "expired" || job.status === "failed") {
      return ignored("unknown_job");
    }

    const session = await getSession(parsed.sessionId);
    const product: Product = session?.product ?? job.product ?? "single";
    const amountCents = session?.amountCents ?? productPriceCents(product);
    const firstUnlock = !isPaid(job);

    if (firstUnlock) {
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

      next = applyProductToAssets(next, product);
      next.product = product;
      next.paidAmountCents = amountCents;
      await saveJob(next);
    } else if (!job.product) {
      await saveJob({
        ...applyProductToAssets(job, product),
        product,
        paidAmountCents: job.paidAmountCents ?? amountCents,
      });
    }

    // Idempotent by session id: a webhook retry after a partial failure can
    // complete a missing record, but an existing marker blocks a second sale.
    await recordSale({
      sessionId: parsed.sessionId,
      product,
      amountCents,
    });

    await setSessionStatus(parsed.sessionId, "paid");
    await kv.set(marker, "done", { exSeconds: IDEMPOTENCY_TTL_SECONDS });
    return Response.json({ received: true });
  } catch (error) {
    // Processing failed: release the claim so the provider's retry can succeed.
    await kv.deleteIfValue(marker, "processing");
    throw error;
  }
}
