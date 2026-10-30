import { handlePaymentWebhook } from "@/lib/webhooks";
import { mockCheckoutEnabled } from "@/lib/payments-ui";
import { getPaymentsProvider } from "@/lib/providers/payments";
import {
  MOCK_SIGNATURE_HEADER,
  mockWebhookBody,
  signMockWebhook,
} from "@/lib/providers/payments/mock";
import { getSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Pay" in the mock checkout: deliver a signed webhook, then go to /success. */
export async function POST(request: Request): Promise<Response> {
  if (!mockCheckoutEnabled()) {
    return new Response(null, { status: 404 });
  }

  const form = await request.formData();
  const sessionId = form.get("session");
  if (typeof sessionId !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) return new Response(null, { status: 404 });

  const body = mockWebhookBody({
    eventId: `evt_mock_${session.id}`,
    sessionId: session.id,
    jobId: session.jobId,
  });
  const headers = new Headers({
    "content-type": "application/json",
    [MOCK_SIGNATURE_HEADER]: signMockWebhook(body),
  });
  const webhookRequest = new Request(
    new URL("/api/webhooks/payments", request.url),
    { method: "POST", headers, body },
  );

  const result = await handlePaymentWebhook(
    webhookRequest,
    getPaymentsProvider(),
  );
  if (!result.ok) {
    // Relative Location keeps the redirect on the submitting origin, which a
    // strict `form-action 'self'` CSP accepts behind proxies and alternate hosts.
    return new Response(null, {
      status: 303,
      headers: { location: `/create?job=${session.jobId}&cancelled=1` },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: `/success?session_id=${encodeURIComponent(session.id)}`,
    },
  });
}
