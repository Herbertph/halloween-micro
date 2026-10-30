import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { applyProductToAssets, createJob, saveJob } from "@/lib/job-service";
import { transition } from "@/lib/jobs";
import { createSessionRecord, setSessionStatus } from "@/lib/sessions";
import { getStorage } from "@/lib/storage";
import type { Job, Product, StyleId } from "@/lib/types";

export async function fixtureBytes(name = "valid.jpg"): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "tests", "fixtures", name));
}

interface PaidJobOptions {
  product?: Product;
  styleId?: StyleId;
  paidAt?: Date;
  sessionId?: string;
}

/**
 * Builds a persisted paid/unlocked job with real objects in storage, as the
 * webhook would leave it after a completed checkout.
 */
export async function makePaidPackJob(
  options: PaidJobOptions = {},
): Promise<{ job: Job; sessionId: string }> {
  const product = options.product ?? "pack";
  const styleId = options.styleId ?? "pumpkin";
  const bytes = await fixtureBytes();

  const created = await createJob({ styleId, ipHash: "test-ip" });
  const storage = getStorage();
  const originalKey = `blobs/${randomUUID()}.jpg`;
  const fullKey = `blobs/${randomUUID()}.jpg`;
  const previewKey = `blobs/${randomUUID()}.jpg`;
  await Promise.all([
    storage.put(originalKey, bytes),
    storage.put(fullKey, bytes),
    storage.put(previewKey, bytes),
  ]);

  let job = transition(created, "generating");
  job.originalKey = originalKey;
  job.fullKey = fullKey;
  job.previewKey = previewKey;
  job.assets = [{ styleId, status: "ready", fullKey, previewKey }];
  job = transition(job, "preview_ready");
  job = applyProductToAssets(job, product);
  job = transition(job, "awaiting_payment");

  const sessionId = options.sessionId ?? `cs_${randomUUID().replace(/-/g, "")}`;
  await createSessionRecord({
    id: sessionId,
    jobId: job.id,
    amountCents: product === "pack" ? 899 : 499,
    product,
  });
  await setSessionStatus(sessionId, "paid");

  job.sessionId = sessionId;
  job = transition(transition(job, "paid", options.paidAt), "unlocked");
  job.product = product;
  job.paidAmountCents = product === "pack" ? 899 : 499;
  job.paidAt = (options.paidAt ?? new Date()).toISOString();
  await saveJob(job);
  return { job, sessionId };
}

/** A preview_ready job with the chosen asset generated (before payment). */
export async function makePreviewPackJob(
  styleId: StyleId = "pumpkin",
): Promise<Job> {
  const bytes = await fixtureBytes();
  const created = await createJob({ styleId, ipHash: "test-ip" });
  const storage = getStorage();
  const originalKey = `blobs/${randomUUID()}.jpg`;
  const fullKey = `blobs/${randomUUID()}.jpg`;
  const previewKey = `blobs/${randomUUID()}.jpg`;
  await Promise.all([
    storage.put(originalKey, bytes),
    storage.put(fullKey, bytes),
    storage.put(previewKey, bytes),
  ]);
  let job = transition(created, "generating");
  job.originalKey = originalKey;
  job.fullKey = fullKey;
  job.previewKey = previewKey;
  job.assets = [{ styleId, status: "ready", fullKey, previewKey }];
  job = transition(job, "preview_ready");
  await saveJob(job);
  return job;
}
