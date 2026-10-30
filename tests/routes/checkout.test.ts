import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as checkout } from "@/app/api/checkout/route";
import { POST as complete } from "@/app/checkout/mock/complete/route";
import { POST as decline } from "@/app/checkout/mock/decline/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { mockCheckoutEnabled } from "@/lib/payments-ui";
import { getSession } from "@/lib/sessions";
import { loadJob } from "@/lib/job-service";
import { resetLimitEnv, useTempDataDir } from "../helpers";
import { jsonRequest, makePreviewJob } from "../helpers/jobs";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  resetLimitEnv();
  process.env.PAYMENT_PROVIDER = "mock";
});

afterEach(async () => {
  process.env.PAYMENT_PROVIDER = "mock";
  await cleanup();
});

function formRequest(url: string, sessionId: string): Request {
  const form = new FormData();
  form.set("session", sessionId);
  return new Request(url, { method: "POST", body: form });
}

describe("checkout", () => {
  it("AC-10: creates a mock session with job_id metadata and a hosted checkout URL", async () => {
    const job = await makePreviewJob();
    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: job.id }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { url: string; sessionId: string };
    expect(body.url).toBe(`/checkout/mock?session=${encodeURIComponent(body.sessionId)}`);

    const session = await getSession(body.sessionId);
    expect(session?.jobId).toBe(job.id);
    expect(session?.amountCents).toBe(499);
    expect(session?.status).toBe("pending");

    const updated = await loadJob(job.id);
    expect(updated?.status).toBe("awaiting_payment");
    expect(updated?.sessionId).toBe(body.sessionId);
  });

  it("AC-22: the mock checkout is enabled only for PAYMENT_PROVIDER=mock", async () => {
    expect(mockCheckoutEnabled("mock")).toBe(true);
    expect(mockCheckoutEnabled("stripe")).toBe(false);

    process.env.PAYMENT_PROVIDER = "stripe";
    const response = await complete(formRequest("http://localhost/checkout/mock/complete", "session"));
    expect(response.status).toBe(404);
    const declineResponse = await decline(
      formRequest("http://localhost/checkout/mock/decline", "session"),
    );
    expect(declineResponse.status).toBe(404);
  });

  it("FR-19: checkout is refused for a job that is not preview_ready", async () => {
    const job = await makePreviewJob();
    const failed = { ...job, status: "failed" as const, error: "no_subject" as const };
    const { saveJob } = await import("@/lib/job-service");
    await saveJob(failed);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: job.id }),
    );
    expect(response.status).toBe(409);
  });

  it("AC-11: Pay delivers a signed webhook and redirects to the success page", async () => {
    const job = await makePreviewJob();
    const checkoutResponse = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: job.id }),
    );
    const { sessionId } = (await checkoutResponse.json()) as { sessionId: string };

    const response = await complete(
      formRequest("http://localhost/checkout/mock/complete", sessionId),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      `/success?session_id=${encodeURIComponent(sessionId)}`,
    );

    const updated = await loadJob(job.id);
    expect(updated?.status).toBe("unlocked");
    expect((await getSession(sessionId))?.status).toBe("paid");

    const jobResponse = await getJob(
      new Request(`http://localhost/api/jobs/${job.id}?session=${sessionId}`),
      { params: Promise.resolve({ id: job.id }) },
    );
    const body = await jobResponse.json();
    expect(body.job.status).toBe("unlocked");
    expect(body.job.downloadUrl).toContain("/api/download?token=");
    expect(body.payment).toBe("paid");
  });

  it("AC-12: Decline leaves the job unpaid and issues no download token", async () => {
    const job = await makePreviewJob();
    const checkoutResponse = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: job.id }),
    );
    const { sessionId } = (await checkoutResponse.json()) as { sessionId: string };

    const response = await decline(
      formRequest("http://localhost/checkout/mock/decline", sessionId),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      `/create?job=${job.id}&declined=1`,
    );

    const updated = await loadJob(job.id);
    expect(updated?.status).toBe("awaiting_payment");
    expect(updated?.paidAt).toBeUndefined();
    expect((await getSession(sessionId))?.status).toBe("declined");

    const jobResponse = await getJob(
      new Request(`http://localhost/api/jobs/${job.id}?session=${sessionId}`),
      { params: Promise.resolve({ id: job.id }) },
    );
    const text = await jobResponse.text();
    expect(text).not.toContain("/api/download");
    expect(text).not.toContain("blobs/");
  });
});
