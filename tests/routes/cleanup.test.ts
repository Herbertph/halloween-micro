import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as cleanupEndpoint } from "@/app/api/cron/cleanup/route";
import { GET as download } from "@/app/api/download/route";
import { createJob, loadJob } from "@/lib/job-service";
import { getStorage } from "@/lib/storage";
import { signDownloadToken } from "@/lib/tokens";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
});

afterEach(async () => {
  process.env.RETENTION_HOURS = "48";
  await cleanup();
});

describe("retention and cleanup", () => {
  it("AC-20: purges expired objects, answers 410 on download and 401 without CRON_SECRET", async () => {
    process.env.RETENTION_HOURS = "0";
    const job = await createJob({ styleId: "pumpkin", ipHash: "test-ip" });

    const storage = getStorage();
    const keys = {
      originalKey: "blobs/cleanup-original.jpg",
      fullKey: "blobs/cleanup-full.jpg",
      previewKey: "blobs/cleanup-preview.jpg",
    };
    await storage.put(keys.originalKey, Buffer.from("original"));
    await storage.put(keys.fullKey, Buffer.from("full"));
    await storage.put(keys.previewKey, Buffer.from("preview"));

    const { saveJob } = await import("@/lib/job-service");
    await saveJob({ ...job, ...keys });

    const unauthorized = await cleanupEndpoint(
      new Request("http://localhost/api/cron/cleanup"),
    );
    expect(unauthorized.status).toBe(401);
    expect(await storage.get(keys.fullKey)).not.toBeNull();

    const wrongSecret = await cleanupEndpoint(
      new Request("http://localhost/api/cron/cleanup", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(wrongSecret.status).toBe(401);

    const authorized = await cleanupEndpoint(
      new Request("http://localhost/api/cron/cleanup", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(authorized.status).toBe(200);
    expect((await authorized.json()).removed).toBeGreaterThanOrEqual(1);

    expect(await storage.get(keys.originalKey)).toBeNull();
    expect(await storage.get(keys.fullKey)).toBeNull();
    expect(await storage.get(keys.previewKey)).toBeNull();
    expect((await loadJob(job.id))?.status).toBe("expired");

    const token = signDownloadToken({
      jobId: job.id,
      key: keys.fullKey,
      exp: Date.now() + 60_000,
    });
    const response = await download(
      new Request(`http://localhost/api/download?token=${encodeURIComponent(token)}`),
    );
    expect(response.status).toBe(410);
  });
});
