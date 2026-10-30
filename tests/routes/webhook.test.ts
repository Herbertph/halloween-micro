import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as webhook } from "@/app/api/webhooks/payments/route";
import { loadJob } from "@/lib/job-service";
import {
  MOCK_SIGNATURE_HEADER,
  mockWebhookBody,
  signMockWebhook,
} from "@/lib/providers/payments/mock";
import { makePreviewJob } from "../helpers/jobs";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
});

afterEach(async () => {
  await cleanup();
});

function webhookRequest(
  body: string,
  options: { signature?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [MOCK_SIGNATURE_HEADER]: options.signature ?? signMockWebhook(body),
      ...options.headers,
    },
    body,
  });
}

describe("POST /api/webhooks/payments", () => {
  it("AC-14: the same event delivered twice unlocks once and both return 200", async () => {
    const job = await makePreviewJob();
    const body = mockWebhookBody({
      eventId: "evt_duplicate",
      sessionId: "cs_test_1",
      jobId: job.id,
    });

    const first = await webhook(webhookRequest(body));
    expect(first.status).toBe(200);
    const afterFirst = await loadJob(job.id);
    expect(afterFirst?.status).toBe("unlocked");
    expect(afterFirst?.paidAt).toBeTruthy();

    const second = await webhook(webhookRequest(body));
    expect(second.status).toBe(200);
    const afterSecond = await loadJob(job.id);
    expect(afterSecond?.status).toBe("unlocked");
    expect(afterSecond?.paidAt).toBe(afterFirst?.paidAt);
  });

  it("AC-15: an invalid signature returns 400 and leaves the job unpaid", async () => {
    const job = await makePreviewJob();
    const body = mockWebhookBody({
      eventId: "evt_bad_signature",
      sessionId: "cs_test_2",
      jobId: job.id,
    });

    const response = await webhook(webhookRequest(body, { signature: "deadbeef" }));
    expect(response.status).toBe(400);
    const updated = await loadJob(job.id);
    expect(updated?.status).toBe("preview_ready");
    expect(updated?.paidAt).toBeUndefined();
  });

  it("returns 200 and ignores unknown jobs and unhandled event types", async () => {
    const unknown = mockWebhookBody({
      eventId: "evt_unknown_job",
      sessionId: "cs_test_3",
      jobId: "job_does_not_exist",
    });
    expect((await webhook(webhookRequest(unknown))).status).toBe(200);

    const otherType = JSON.stringify({
      id: "evt_other",
      type: "invoice.paid",
      data: { object: { id: "cs_test_4", metadata: { job_id: "job_x" } } },
    });
    expect((await webhook(webhookRequest(otherType))).status).toBe(200);
  });
});
