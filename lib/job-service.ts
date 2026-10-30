import { randomUUID } from "node:crypto";

import { getKv } from "@/lib/kv";
import { getStorage } from "@/lib/storage";
import { retentionHours } from "@/lib/env";
import {
  expiresAtFor,
  isExpired,
  toPublicJob,
  transition,
} from "@/lib/jobs";
import { signDownloadToken, DOWNLOAD_TOKEN_TTL_MS } from "@/lib/tokens";
import type { Job, PublicJob, StyleId } from "@/lib/types";

const JOB_PREFIX = "job:";
const JOB_INDEX = "jobs:index";
const EXPIRED_MARKER = "expired";

function jobKey(id: string) {
  return `${JOB_PREFIX}${id}`;
}

async function readIndex(): Promise<string[]> {
  const raw = await getKv().get(JOB_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function addToIndex(id: string): Promise<void> {
  const ids = await readIndex();
  if (!ids.includes(id)) {
    ids.push(id);
    await getKv().set(JOB_INDEX, JSON.stringify(ids));
  }
}

export async function createJob(input: {
  styleId: StyleId;
  ipHash: string;
  now?: Date;
}): Promise<Job> {
  const now = input.now ?? new Date();
  const job: Job = {
    id: `job_${randomUUID().replace(/-/g, "")}`,
    createdAt: now.toISOString(),
    expiresAt: expiresAtFor(now, retentionHours()),
    status: "created",
    styleId: input.styleId,
    ipHash: input.ipHash,
  };
  await getKv().set(jobKey(job.id), JSON.stringify(job));
  await addToIndex(job.id);
  return job;
}

export async function saveJob(job: Job): Promise<void> {
  await getKv().set(jobKey(job.id), JSON.stringify(job));
}

/** Deletes every stored object belonging to a job. */
export async function purgeJobObjects(job: Job): Promise<void> {
  const storage = getStorage();
  const keys = [job.originalKey, job.fullKey, job.previewKey].filter(
    (key): key is string => Boolean(key),
  );
  await Promise.all(keys.map((key) => storage.delete(key)));
}

/**
 * Loads a job and applies lazy retention: anything past `expiresAt` is purged,
 * marked expired and returned as expired (callers answer 410).
 */
export async function loadJob(
  id: string,
  now: Date = new Date(),
): Promise<Job | null> {
  const raw = await getKv().get(jobKey(id));
  if (!raw) return null;
  let job: Job;
  try {
    job = JSON.parse(raw) as Job;
  } catch {
    return null;
  }
  if (job.status !== "expired" && isExpired(job, now)) {
    await purgeJobObjects(job);
    const expired = transition(job, "expired", now);
    await saveJob(expired);
    return expired;
  }
  return job;
}

/** Issues a 15 minute signed download URL. Only paid jobs ever get one. */
export function downloadUrlFor(job: Job, now: Date = new Date()): string | undefined {
  if (!job.fullKey) return undefined;
  if (job.status !== "paid" && job.status !== "unlocked") return undefined;
  const token = signDownloadToken({
    jobId: job.id,
    key: job.fullKey,
    exp: now.getTime() + DOWNLOAD_TOKEN_TTL_MS,
  });
  return `/api/download?token=${encodeURIComponent(token)}`;
}

export function publicJobView(job: Job, now: Date = new Date()): PublicJob {
  const view = toPublicJob(job);
  const downloadUrl = downloadUrlFor(job, now);
  if (downloadUrl) view.downloadUrl = downloadUrl;
  return view;
}

/**
 * Cron cleanup: purges every expired job and returns how many were removed.
 */
export async function cleanupExpiredJobs(now: Date = new Date()): Promise<number> {
  const ids = await readIndex();
  let removed = 0;
  for (const id of ids) {
    const job = await loadJob(id, now);
    if (!job) continue;
    if (job.status === EXPIRED_MARKER || isExpired(job, now)) {
      if (job.status !== EXPIRED_MARKER) {
        await purgeJobObjects(job);
        await saveJob(transition(job, "expired", now));
      }
      removed += 1;
    }
  }
  return removed;
}
