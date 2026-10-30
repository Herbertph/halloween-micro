import { ApiError, apiErrorResponse, readJson } from "@/lib/api";
import { assertProductionConfig } from "@/lib/config-check";
import { loadJob, saveJob, applyProductToAssets } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import { getPaymentsProvider } from "@/lib/providers/payments";
import { isProduct, productPriceCents, type Product } from "@/lib/products";
import { createSessionRecord } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const config = assertProductionConfig();
  if (!config.ready) {
    return Response.json(
      { error: "misconfigured", problems: config.problems },
      { status: 503 },
    );
  }

  try {
    const body = await readJson<{ jobId?: unknown; product?: unknown }>(request);
    if (typeof body.jobId !== "string") {
      throw new ApiError("invalid_request", 400);
    }
    // Missing product stays valid for increment 1 clients and means "single".
    let product: Product = "single";
    if (body.product !== undefined) {
      if (!isProduct(body.product)) throw new ApiError("invalid_product", 400);
      product = body.product;
    }

    const job = await loadJob(body.jobId);
    if (!job) throw new ApiError("job_not_found", 404);
    if (job.status === "expired") throw new ApiError("job_expired", 410);
    // A declined session leaves the job in awaiting_payment, so that state may
    // open a fresh session; nothing else may.
    if (job.status !== "preview_ready" && job.status !== "awaiting_payment") {
      throw new ApiError("invalid_state", 409);
    }

    // Prices and product composition live on the server; the client only names
    // the product.
    const amountCents = productPriceCents(product);
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
      product,
    });

    // A pack reserves its four assets at checkout; extras stay pending and are
    // only generated after the webhook. The product itself is recorded on the
    // job by the webhook, never here.
    const withAssets =
      product === "pack" ? applyProductToAssets(job, "pack") : job;
    const next =
      withAssets.status === "preview_ready"
        ? transition(withAssets, "awaiting_payment")
        : withAssets;
    next.sessionId = session.sessionId;
    await saveJob(next);

    return Response.json({
      sessionId: session.sessionId,
      url: session.url,
      product,
      amountCents,
    });
  } catch (error) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    return Response.json({ error: "fatal" }, { status: 500 });
  }
}
