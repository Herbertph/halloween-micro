import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as download } from "@/app/api/download/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { loadJob, saveJob } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import { createSessionRecord, setSessionStatus } from "@/lib/sessions";
import { getStorage } from "@/lib/storage";
import { signDownloadToken } from "@/lib/tokens";
import { makePaidJob, makePreviewJob } from "../helpers/jobs";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
});

afterEach(async () => {
  await cleanup();
});

function downloadRequest(token: string): Request {
  return new Request(`http://localhost/api/download?token=${encodeURIComponent(token)}`);
}

describe("GET /api/download", () => {
  it("AC-11: streams the exact stored full-resolution bytes for a paid job", async () => {
    const bytes = Buffer.from("EXACT-FULL-RESOLUTION-BYTES");
    const job = await makePaidJob(bytes);
    const token = signDownloadToken({
      jobId: job.id,
      key: job.fullKey!,
      exp: Date.now() + 60_000,
    });

    const response = await download(downloadRequest(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(bytes)).toBe(true);
  });

  it("AC-11/AC-13: only the owning paid session receives a download URL", async () => {
    const bytes = Buffer.from("PAID-BYTES");
    const job = await makePaidJob(bytes);
    const session = await createSessionRecord({
      jobId: job.id,
      amountCents: 499,
    });
    await setSessionStatus(session.id, "paid");
    await saveJob({ ...job, sessionId: session.id });

    const owning = await getJob(
      new Request(`http://localhost/api/jobs/${job.id}?session=${session.id}`),
      { params: Promise.resolve({ id: job.id }) },
    );
    const owningBody = await owning.json();
    expect(owningBody.job.downloadUrl).toContain("/api/download?token=");

    const url = new URL(owningBody.job.downloadUrl, "http://localhost");
    const fileResponse = await download(new Request(url));
    expect(Buffer.from(await fileResponse.arrayBuffer()).equals(bytes)).toBe(true);

    const forged = await getJob(
      new Request(`http://localhost/api/jobs/${job.id}?session=cs_forged`),
      { params: Promise.resolve({ id: job.id }) },
    );
    const forgedText = await forged.text();
    expect(forgedText).not.toContain("/api/download");
    expect(forgedText).not.toContain("blobs/");
  });

  it("AC-13: unknown jobs and forged sessions never unlock anything", async () => {
    const missing = await getJob(
      new Request("http://localhost/api/jobs/job_nope"),
      { params: Promise.resolve({ id: "job_nope" }) },
    );
    expect(missing.status).toBe(404);

    const unpaid = await makePreviewJob();
    const response = await getJob(
      new Request(`http://localhost/api/jobs/${unpaid.id}?session=cs_forged`),
      { params: Promise.resolve({ id: unpaid.id }) },
    );
    const text = await response.text();
    expect(text).not.toContain("/api/download");
    expect(text).not.toContain("blobs/");
  });

  it("AC-21: returns 403 for a tampered token and 410 for an expired one", async () => {
    const job = await makePaidJob(Buffer.from("bytes"));

    const token = signDownloadToken({
      jobId: job.id,
      key: job.fullKey!,
      exp: Date.now() + 60_000,
    });
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${(signature[0] === "a" ? "b" : "a") + signature.slice(1)}`;
    expect((await download(downloadRequest(tampered))).status).toBe(403);

    const expired = signDownloadToken({
      jobId: job.id,
      key: job.fullKey!,
      exp: Date.now() - 1_000,
    });
    expect((await download(downloadRequest(expired))).status).toBe(410);
  });

  it("AC-21: a valid token for an unpaid job is refused", async () => {
    const job = await makePreviewJob();
    const storage = getStorage();
    await storage.put(job.fullKey!, Buffer.from("LEAK"));
    const token = signDownloadToken({
      jobId: job.id,
      key: job.fullKey!,
      exp: Date.now() + 60_000,
    });
    expect((await download(downloadRequest(token))).status).toBe(410);
  });

  it("AC-13: a deleted object answers 410 without content", async () => {
    const job = await makePaidJob(Buffer.from("will-be-deleted"));
    await getStorage().delete(job.fullKey!);
    const token = signDownloadToken({
      jobId: job.id,
      key: job.fullKey!,
      exp: Date.now() + 60_000,
    });
    const response = await download(downloadRequest(token));
    expect(response.status).toBe(410);
    expect(await response.text()).not.toContain("will-be-deleted");
  });

  it("AC-20: an expired job answers 410 even with a valid token", async () => {
    const job = await makePaidJob(Buffer.from("expiring"));
    const expired = transition(job, "expired");
    await saveJob(expired);

    const token = signDownloadToken({
      jobId: job.id,
      key: job.fullKey!,
      exp: Date.now() + 60_000,
    });
    const response = await download(downloadRequest(token));
    expect(response.status).toBe(410);
    expect((await loadJob(job.id))?.status).toBe("expired");
  });
});
