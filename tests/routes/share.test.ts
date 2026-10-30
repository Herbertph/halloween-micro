import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as share } from "@/app/api/share/route";
import { GET as jobsRoute } from "@/app/api/jobs/[id]/route";
import { loadJob } from "@/lib/job-service";
import { signShareToken } from "@/lib/tokens";
import type { PublicJob } from "@/lib/types";
import { useTempDataDir } from "../helpers";
import { makePaidPackJob, makePreviewPackJob } from "../helpers/packs";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
});

afterEach(async () => {
  await cleanup();
});

async function paidJobView(jobId: string, sessionId: string): Promise<PublicJob> {
  const response = await jobsRoute(
    new Request(`http://localhost/api/jobs/${jobId}?session=${sessionId}`),
    { params: Promise.resolve({ id: jobId }) },
  );
  const body = (await response.json()) as { job: PublicJob };
  return body.job;
}

function shareRequest(token: string): Request {
  return new Request(
    `http://localhost/api/share?token=${encodeURIComponent(token)}`,
  );
}

describe("share image", () => {
  it("AC-13/AC-16: a paid job exposes a landscape JPEG with a footer under 3 MB", async () => {
    const { job, sessionId } = await makePaidPackJob({ product: "pack" });
    const view = await paidJobView(job.id, sessionId);
    expect(view.shareUrl).toBeTruthy();

    const response = await share(new Request(`http://localhost${view.shareUrl}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toContain(
      "haunted-portrait-before-after.jpg",
    );

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.length).toBeLessThan(3 * 1024 * 1024);
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(bytes).metadata();
    expect(metadata.width).toBeGreaterThan(metadata.height ?? 0);
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
  });

  it("AC-15: unpaid and forged sessions get no share URL and the endpoint refuses", async () => {
    const job = await makePreviewPackJob("pumpkin");
    const view = await paidJobView(job.id, "cs_forged");
    expect(view.shareUrl).toBeUndefined();

    const current = await loadJob(job.id);
    const validButUnpaid = signShareToken({
      jobId: job.id,
      styleId: current!.styleId,
      exp: Date.now() + 60_000,
    });
    expect((await share(shareRequest(validButUnpaid))).status).toBe(403);

    const [payload, signature] = validButUnpaid.split(".");
    const forged = `${payload}.${(signature[0] === "a" ? "b" : "a") + signature.slice(1)}`;
    expect((await share(shareRequest(forged))).status).toBe(403);

    const expired = signShareToken({
      jobId: job.id,
      styleId: current!.styleId,
      exp: Date.now() - 1_000,
    });
    expect((await share(shareRequest(expired))).status).toBe(410);
  });
});
