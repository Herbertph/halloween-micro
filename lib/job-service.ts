import { randomUUID } from "node:crypto";

import { normalizeJob } from "@/lib/assets";
import { getKv } from "@/lib/kv";
import { getStorage } from "@/lib/storage";
import { retentionHours } from "@/lib/env";
import {
  expiresAtFor,
  isExpired,
  toPublicJob,
  transition,
} from "@/lib/jobs";
import { packStyles } from "@/lib/products";
import { signDownloadToken, signShareToken, DOWNLOAD_TOKEN_TTL_MS } from "@/lib/tokens";
import type {
  Asset,
  Job,
  Product,
  PublicAsset,
  PublicJob,
  StyleId,
} from "@/lib/types";

const JOB_PREFIX = "job:";
const JOB_INDEX = "jobs:index";
const EXPIRED_MARKER = "expired";

function jobKey(id: string) {
  return `${JOB_PREFIX}${id}`;
}

async function addToIndex(id: string): Promise<void> {
  // Atomic set add: concurrent job creation must not overwrite each other.
  await getKv().setAdd(JOB_INDEX, id);
}

export async function listJobIds(): Promise<string[]> {
  return getKv().setMembers(JOB_INDEX);
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

/** Deletes every stored object belonging to a job (original + every asset). */
export async function purgeJobObjects(job: Job): Promise<void> {
  const storage = getStorage();
  const keys = new Set<string>();
  if (job.originalKey) keys.add(job.originalKey);
  if (job.fullKey) keys.add(job.fullKey);
  if (job.previewKey) keys.add(job.previewKey);
  for (const asset of job.assets ?? []) {
    if (asset.fullKey) keys.add(asset.fullKey);
    if (asset.previewKey) keys.add(asset.previewKey);
  }
  await Promise.all([...keys].map((key) => storage.delete(key)));
}

/**
 * Loads a job, normalises increment 1 jobs into the asset model and applies
 * lazy retention. Expired jobs are purged and answered as expired (410).
 */
export async function loadJob(
  id: string,
  now: Date = new Date(),
): Promise<Job | null> {
  const raw = await getKv().get(jobKey(id));
  if (!raw) return null;
  let job: Job;
  try {
    job = normalizeJob(JSON.parse(raw) as Job);
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

function assetDownloadUrl(job: Job, asset: Asset, now: Date): string | undefined {
  if (!asset.fullKey || asset.status !== "ready") return undefined;
  if (job.status !== "paid" && job.status !== "unlocked") return undefined;
  const token = signDownloadToken({
    jobId: job.id,
    key: asset.fullKey,
    styleId: asset.styleId,
    exp: now.getTime() + DOWNLOAD_TOKEN_TTL_MS,
  });
  return `/api/download?token=${encodeURIComponent(token)}`;
}

/** Issues a 15 minute signed download URL for the chosen asset. */
export function downloadUrlFor(
  job: Job,
  now: Date = new Date(),
): string | undefined {
  const assets = normalizeJob(job).assets ?? [];
  const chosen = assets.find((asset) => asset.styleId === job.styleId);
  return chosen ? assetDownloadUrl(job, chosen, now) : undefined;
}

function shareUrlFor(job: Job, now: Date): string | undefined {
  if (job.status !== "paid" && job.status !== "unlocked") return undefined;
  if (!job.originalKey) return undefined;
  const chosen = (normalizeJob(job).assets ?? []).find(
    (asset) => asset.styleId === job.styleId && asset.status === "ready",
  );
  if (!chosen?.fullKey) return undefined;
  const token = signShareToken({
    jobId: job.id,
    styleId: job.styleId,
    exp: now.getTime() + DOWNLOAD_TOKEN_TTL_MS,
  });
  return `/api/share?token=${encodeURIComponent(token)}`;
}

function publicAsset(
  job: Job,
  asset: Asset,
  paidOwner: boolean,
  now: Date,
): PublicAsset {
  const view: PublicAsset = { styleId: asset.styleId, status: asset.status };
  if (asset.error) view.error = asset.error;
  if (asset.styleId === job.styleId && job.previewKey) {
    view.previewUrl = `/api/preview/${job.id}`;
  }
  if (paidOwner) {
    const downloadUrl = assetDownloadUrl(job, asset, now);
    if (downloadUrl) view.downloadUrl = downloadUrl;
  }
  return view;
}

export interface PublicJobOptions {
  paidOwner?: boolean;
  now?: Date;
}

export function publicJobView(
  job: Job,
  options: PublicJobOptions = {},
): PublicJob {
  const now = options.now ?? new Date();
  const paidOwner = options.paidOwner ?? false;
  const normalized = normalizeJob(job);
  const view = toPublicJob(normalized);
  view.assets = (normalized.assets ?? []).map((asset) =>
    publicAsset(normalized, asset, paidOwner, now),
  );
  if (normalized.product) view.product = normalized.product;
  if (paidOwner) {
    const downloadUrl = downloadUrlFor(normalized, now);
    if (downloadUrl) view.downloadUrl = downloadUrl;
    const shareUrl = shareUrlFor(normalized, now);
    if (shareUrl) view.shareUrl = shareUrl;
  }
  return view;
}

/**
 * Adds the pending styles a pack needs (or trims extras back to the chosen
 * style for a single purchase). Never generates anything.
 */
export function applyProductToAssets(job: Job, product: Product): Job {
  const normalized = normalizeJob(job);
  const assets = normalized.assets ?? [];
  const chosen =
    assets.find((asset) => asset.styleId === normalized.styleId) ??
    ({
      styleId: normalized.styleId,
      status: normalized.fullKey ? "ready" : "pending",
      ...(normalized.fullKey ? { fullKey: normalized.fullKey } : {}),
      ...(normalized.previewKey ? { previewKey: normalized.previewKey } : {}),
    } satisfies Asset);

  if (product === "single") {
    return { ...normalized, assets: [chosen] };
  }

  const byStyle = new Map(assets.map((asset) => [asset.styleId, asset]));
  const order = packStyles(normalized.styleId);
  const next = order.map(
    (styleId): Asset =>
      styleId === normalized.styleId
        ? { ...chosen, styleId }
        : byStyle.get(styleId) ?? { styleId, status: "pending" },
  );
  return { ...normalized, assets: next };
}

/**
 * Cron cleanup: purges every expired job, removes its index entry and returns
 * how many jobs were swept.
 */
export async function cleanupExpiredJobs(now: Date = new Date()): Promise<number> {
  const kv = getKv();
  const ids = await kv.setMembers(JOB_INDEX);
  let removed = 0;
  for (const id of ids) {
    const job = await loadJob(id, now);
    if (!job) {
      await kv.setRemove(JOB_INDEX, id);
      continue;
    }
    if (job.status === EXPIRED_MARKER || isExpired(job, now)) {
      if (job.status !== EXPIRED_MARKER) {
        await purgeJobObjects(job);
        await saveJob(transition(job, "expired", now));
      }
      await kv.setRemove(JOB_INDEX, id);
      removed += 1;
    }
  }
  return removed;
}
