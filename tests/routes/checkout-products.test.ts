import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as checkout } from "@/app/api/checkout/route";
import { POST as webhook } from "@/app/api/webhooks/payments/route";
import { loadJob } from "@/lib/job-service";
import {
  MOCK_SIGNATURE_HEADER,
  mockWebhookBody,
  signMockWebhook,
} from "@/lib/providers/payments/mock";
import { getSession } from "@/lib/sessions";
import { useTempDataDir } from "../helpers";
import { makePreviewJob } from "../helpers/jobs";
import { jsonRequest } from "../helpers/jobs";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
});

afterEach(async () => {
  await cleanup();
});

function webhookRequest(body: string): Request {
  return new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [MOCK_SIGNATURE_HEADER]: signMockWebhook(body),
    },
    body,
  });
}

describe("checkout products", () => {
  it("AC-3: rejects an unknown product and ignores any client amount", async () => {
    const job = await makePreviewJob();

    const invalid = await checkout(
      jsonRequest("http://localhost/api/checkout", {
        jobId: job.id,
        product: "mega",
      }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("invalid_product");

    const valid = await checkout(
      jsonRequest("http://localhost/api/checkout", {
        jobId: job.id,
        product: "pack",
        amountCents: 1,
      }),
    );
    expect(valid.status).toBe(200);
    const body = (await valid.json()) as {
      product: string;
      amountCents: number;
      sessionId: string;
    };
    expect(body.product).toBe("pack");
    expect(body.amountCents).toBe(899);

    const session = await getSession(body.sessionId);
    expect(session?.product).toBe("pack");
    expect(session?.amountCents).toBe(899);
  });

  it("AC-3: a missing product stays valid for increment 1 clients and means single", async () => {
    const job = await makePreviewJob();
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: job.id }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      product: string;
      amountCents: number;
      sessionId: string;
    };
    expect(body.product).toBe("single");
    expect(body.amountCents).toBe(499);
    const session = await getSession(body.sessionId);
    expect(session?.product).toBe("single");
    expect(session?.amountCents).toBe(499);
  });

  it("AC-4: records the product on the session, and on the job only after the webhook", async () => {
    const job = await makePreviewJob();
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", {
        jobId: job.id,
        product: "pack",
      }),
    );
    const body = (await response.json()) as { sessionId: string };

    const beforePayment = await loadJob(job.id);
    expect(beforePayment?.product).toBeUndefined();
    expect(beforePayment?.assets).toHaveLength(4);

    const payload = mockWebhookBody({
      eventId: "evt_product_1",
      sessionId: body.sessionId,
      jobId: job.id,
    });
    expect((await webhook(webhookRequest(payload))).status).toBe(200);

    const afterPayment = await loadJob(job.id);
    expect(afterPayment?.product).toBe("pack");
    expect(afterPayment?.paidAmountCents).toBe(899);
    expect(afterPayment?.status).toBe("unlocked");
    expect(afterPayment?.assets?.filter((asset) => asset.status === "pending")).toHaveLength(
      3,
    );

    const session = await getSession(body.sessionId);
    expect(session?.status).toBe("paid");
  });

  it("AC-6: a single checkout keeps one asset and records the single product", async () => {
    const job = await makePreviewJob();
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: job.id, product: "single" }),
    );
    const body = (await response.json()) as { sessionId: string; amountCents: number };
    expect(body.amountCents).toBe(499);

    await webhook(
      webhookRequest(
        mockWebhookBody({
          eventId: "evt_single",
          sessionId: body.sessionId,
          jobId: job.id,
        }),
      ),
    );

    const paid = await loadJob(job.id);
    expect(paid?.product).toBe("single");
    expect(paid?.assets).toHaveLength(1);
  });
});
