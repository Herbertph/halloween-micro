export interface CreateSessionInput {
  jobId: string;
  amountCents: number;
}

export interface CreateSessionResult {
  url: string;
  sessionId: string;
}

export interface WebhookParseInput {
  headers: Headers;
  body: string;
}

export interface ParsedWebhook {
  eventId: string;
  type: string;
  jobId?: string;
  sessionId: string;
}

export type WebhookParseResult = ParsedWebhook | { invalid: true };

export interface PaymentsProvider {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  parseWebhook(input: WebhookParseInput): Promise<WebhookParseResult>;
}

export const PAYMENT_COMPLETED_EVENT = "checkout.session.completed";
