import type { Asset, Job } from "@/lib/types";

/**
 * Increment 1 jobs had a single implicit asset. Normalise them on read so every
 * route, the share image and the cleanup cron see the same shape.
 */
export function normalizeJob(job: Job): Job {
  if (job.assets && job.assets.length > 0) return job;

  const status: Asset["status"] =
    job.status === "failed"
      ? "failed"
      : job.fullKey || job.previewKey
        ? "ready"
        : "pending";
  const asset: Asset = {
    styleId: job.styleId,
    status,
    ...(job.fullKey ? { fullKey: job.fullKey } : {}),
    ...(job.previewKey ? { previewKey: job.previewKey } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
  return { ...job, assets: [asset] };
}

export function findAsset(job: Job, styleId: string): Asset | undefined {
  return normalizeJob(job).assets?.find((asset) => asset.styleId === styleId);
}

export function chosenAsset(job: Job): Asset | undefined {
  return findAsset(job, job.styleId);
}

export function hasPendingAssets(job: Job): boolean {
  return (normalizeJob(job).assets ?? []).some(
    (asset) => asset.status === "pending" || asset.status === "generating",
  );
}

export function assetKeys(job: Job): string[] {
  const keys = new Set<string>();
  if (job.originalKey) keys.add(job.originalKey);
  for (const asset of normalizeJob(job).assets ?? []) {
    if (asset.fullKey) keys.add(asset.fullKey);
    if (asset.previewKey) keys.add(asset.previewKey);
  }
  return [...keys];
}
