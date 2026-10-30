import { mockCheckoutEnabled } from "@/lib/payments-ui";
import { getSession, setSessionStatus } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Decline" in the mock checkout: no webhook, job stays unpaid. */
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

  await setSessionStatus(session.id, "declined");

  return Response.redirect(
    new URL(`/create?job=${session.jobId}&declined=1`, request.url),
    303,
  );
}
