import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupExpiredJobs, createJob, saveJob } from "@/lib/job-service";
import { getStorage } from "@/lib/storage";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  process.env.RETENTION_HOURS = "0";
});

afterEach(async () => {
  process.env.RETENTION_HOURS = "48";
  await cleanup();
});

describe("retention under concurrent traffic", () => {
  it("AC-20/FR-31: cleanup deletes the objects of every expired job created at the same time", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createJob({ styleId: "pumpkin", ipHash: `ip-${index}` }),
      ),
    );

    const storage = getStorage();
    for (const job of jobs) {
      const keys = {
        originalKey: `blobs/${job.id}-original.jpg`,
        fullKey: `blobs/${job.id}-full.jpg`,
        previewKey: `blobs/${job.id}-preview.jpg`,
      };
      await storage.put(keys.originalKey, Buffer.from("original"));
      await storage.put(keys.fullKey, Buffer.from("full"));
      await storage.put(keys.previewKey, Buffer.from("preview"));
      await saveJob({ ...job, ...keys });
    }

    // A minute after creation the 0-hour retention window is over for every job.
    await cleanupExpiredJobs(new Date(Date.now() + 60_000));

    const survivors: string[] = [];
    for (const job of jobs) {
      const full = await storage.get(`blobs/${job.id}-full.jpg`);
      if (full) survivors.push(job.id);
    }

    expect(survivors).toEqual([]);
  });
});
