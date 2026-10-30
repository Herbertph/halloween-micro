import { createHmac, timingSafeEqual } from "node:crypto";

import { siteUrl } from "@/lib/env";

import type {
  CreateSessionInput,
  CreateSessionResult,
  PaymentsProvider,
  WebhookParseInput,
  WebhookParseResult,
} from "./types";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function apiBase(): string {
  return process.env.STRIPE_API_BASE || "https://api.stripe.com";
}

function secretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY;
}

function webhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: { id?: string; metadata?: { job_id?: string } } };
}

/**
 * Stripe Checkout adapter. Implemented but unverified in this increment (no
 * key). A missing key fails before any network call.
 */
export class StripePaymentsProvider implements PaymentsProvider {
  async createSession(
    input: CreateSessionInput,
  ): Promise<CreateSessionResult> {
    const key = secretKey();
    if (!key) throw new Error("STRIPE_SECRET_KEY is required for PAYMENT_PROVIDER=stripe");

    const body = new URLSearchParams({
      mode: "payment",
      success_url: `${siteUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/create?cancelled=1`,
      client_reference_id: input.jobId,
      "metadata[job_id]": input.jobId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(input.amountCents),
      "line_items[0][price_data][product_data][name]": "Haunted Portrait — HD download",
    });

    const response = await fetch(`${apiBase()}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error(`Stripe checkout failed: ${response.status}`);
    }
    const session = (await response.json()) as { id?: string; url?: string };
    if (!session.id || !session.url) {
      throw new Error("Stripe checkout returned no session");
    }
    return { sessionId: session.id, url: session.url };
  }

  async parseWebhook(input: WebhookParseInput): Promise<WebhookParseResult> {
    const secret = webhookSecret();
    const header = input.headers.get("stripe-signature");
    if (!secret || !header) return { invalid: true };

    const parts = new Map(
      header.split(",").map((part) => {
        const [name, value] = part.split("=");
        return [name?.trim(), value?.trim()];
      }),
    );
    const timestamp = parts.get("t");
    const provided = parts.get("v1");
    if (!timestamp || !provided) return { invalid: true };

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
      return { invalid: true };
    }

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${input.body}`)
      .digest("hex");
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return { invalid: true };
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(input.body);
    } catch {
      return { invalid: true };
    }
    const sessionId = event.data?.object?.id;
    if (typeof event.id !== "string" || typeof event.type !== "string" || !sessionId) {
      return { invalid: true };
    }

    return {
      eventId: event.id,
      type: event.type,
      sessionId,
      ...(event.data?.object?.metadata?.job_id
        ? { jobId: event.data.object.metadata.job_id }
        : {}),
    };
  }
}
