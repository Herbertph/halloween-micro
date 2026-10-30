import { createHmac, randomUUID } from "node:crypto";

import { mockWebhookSecret } from "@/lib/env";

import type {
  CreateSessionResult,
  PaymentsProvider,
  WebhookParseInput,
  WebhookParseResult,
} from "./types";

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export function signMockWebhook(body: string): string {
  return createHmac("sha256", mockWebhookSecret()).update(body).digest("hex");
}

/** Builds the JSON body the mock checkout delivers to the webhook. */
export function mockWebhookBody(input: {
  eventId: string;
  sessionId: string;
  jobId: string;
}): string {
  return JSON.stringify({
    id: input.eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        metadata: { job_id: input.jobId },
      },
    },
  });
}

/**
 * Hosted-checkout stand-in that mirrors Stripe Checkout semantics: it creates
 * a session, then a signed webhook is the only thing that unlocks a job.
 */
export class MockPaymentsProvider implements PaymentsProvider {
  async createSession(): Promise<CreateSessionResult> {
    const sessionId = `cs_mock_${randomUUID().replace(/-/g, "")}`;
    return {
      sessionId,
      url: `/checkout/mock?session=${encodeURIComponent(sessionId)}`,
    };
  }

  async parseWebhook(input: WebhookParseInput): Promise<WebhookParseResult> {
    const provided = input.headers.get(MOCK_SIGNATURE_HEADER);
    if (!provided) return { invalid: true };
    if (provided !== signMockWebhook(input.body)) return { invalid: true };

    let event: {
      id?: unknown;
      type?: unknown;
      data?: { object?: { id?: unknown; metadata?: { job_id?: unknown } } };
    };
    try {
      event = JSON.parse(input.body);
    } catch {
      return { invalid: true };
    }

    const sessionId = event.data?.object?.id;
    if (typeof event.id !== "string" || typeof event.type !== "string") {
      return { invalid: true };
    }
    if (typeof sessionId !== "string") return { invalid: true };

    const jobId = event.data?.object?.metadata?.job_id;
    return {
      eventId: event.id,
      type: event.type,
      sessionId,
      ...(typeof jobId === "string" ? { jobId } : {}),
    };
  }
}
