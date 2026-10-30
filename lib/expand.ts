import { randomUUID } from "node:crypto";

import { hasPendingAssets, normalizeJob } from "@/lib/assets";
import { generationTimeoutMs } from "@/lib/env";
import { getImageProvider } from "@/lib/providers/image";
import { getKv } from "@/lib/kv";
import { runGeneration } from "@/lib/generation";
import { isPaid } from "@/lib/jobs";
import {
  listJobIds,
  loadJob,
  saveJob,
} from "@/lib/job-service";
import { incrementGenerations } from "@/lib/stats";
import { getStorage } from "@/lib/storage";
import type { Asset, GenerateError, Job, StyleId } from "@/lib/types";

const EDIT_LOCK_TTL_SECONDS = 5;
const EDIT_LOCK_WAIT_MS = 50;
const EDIT_LOCK_TRIES = 20;
/** Long enough for two full generation attempts; expired claims are reclaimable. */
const CLAIM_TTL_SECONDS = Math.ceil((2 * generationTimeoutMs()) / 1000) + 30;
/** A `generating` asset older than one attempt budget is treated as crashed. */
const STALE_GENERATING_MS = generationTimeoutMs();
export const MAX_EXPANSIONS_PER_RUN = 3;
export const PACK_SWEEP_MIN_AGE_MS = 60_000;

function claimKey(jobId: string, styleId: StyleId): string {
  return `claim:${jobId}:${styleId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialises the short read-modify-write that updates one asset, so two
 * concurrent expansions of different styles cannot clobber each other.
 */
async function updateAsset(
  jobId: string,
  styleId: StyleId,
  patch: Partial<Asset>,
): Promise<Job | null> {
  const kv = getKv();
  const lockKey = `job-edit:${jobId}`;
  for (let attempt = 0; attempt < EDIT_LOCK_TRIES; attempt += 1) {
    const token = randomUUID();
    if (await kv.setIfAbsent(lockKey, token, EDIT_LOCK_TTL_SECONDS)) {
      try {
        const job = await loadJob(jobId);
        if (!job) return null;
        const assets = (normalizeJob(job).assets ?? []).map((asset) =>
          asset.styleId === styleId ? { ...asset, ...patch } : asset,
        );
        const next: Job = { ...job, assets };
        if (styleId === job.styleId) {
          if (patch.fullKey !== undefined) next.fullKey = patch.fullKey;
          if (patch.previewKey !== undefined) next.previewKey = patch.previewKey;
        }
        await saveJob(next);
        return next;
      } finally {
        await kv.deleteIfValue(lockKey, token);
      }
    }
    await sleep(EDIT_LOCK_WAIT_MS);
  }
  return null;
}

async function releaseClaim(
  jobId: string,
  styleId: StyleId,
  token: string,
): Promise<void> {
  await getKv().deleteIfValue(claimKey(jobId, styleId), token);
}

function isReclaimable(asset: Asset, now: number): boolean {
  if (asset.status === "pending") return true;
  if (asset.status !== "generating") return false;
  if (!asset.startedAt) return true;
  const started = Date.parse(asset.startedAt);
  return !Number.isFinite(started) || now - started >= STALE_GENERATING_MS;
}

export interface ExpandResult {
  job: Job | null;
  generated: boolean;
}

/**
 * Claims and generates at most one asset. The claim is an atomic KV key with a
 * TTL, so a crashed worker stops blocking after the generation budget and the
 * style can be reclaimed. The chosen style (ready from the preview) is never a
 * candidate.
 */
export async function expandJob(
  jobId: string,
  options: { styleId?: StyleId } = {},
): Promise<ExpandResult> {
  const job = await loadJob(jobId);
  if (!job || job.status === "expired" || !isPaid(job)) {
    return { job, generated: false };
  }

  const assets = normalizeJob(job).assets ?? [];
  const now = Date.now();
  let candidates: Asset[];
  if (options.styleId) {
    const retry = assets.find(
      (asset) =>
        asset.styleId === options.styleId && asset.status === "failed",
    );
    if (!retry) return { job, generated: false };
    candidates = [retry];
  } else {
    candidates = assets.filter((asset) => isReclaimable(asset, now));
  }
  if (candidates.length === 0) return { job, generated: false };

  const kv = getKv();
  let claimed: Asset | undefined;
  let claimToken = "";
  for (const candidate of candidates) {
    const token = randomUUID();
    if (
      await kv.setIfAbsent(
        claimKey(job.id, candidate.styleId),
        token,
        CLAIM_TTL_SECONDS,
      )
    ) {
      claimed = candidate;
      claimToken = token;
      break;
    }
  }
  if (!claimed) return { job, generated: false };

  const styleId = claimed.styleId;
  const generating = await updateAsset(job.id, styleId, {
    status: "generating",
    startedAt: new Date().toISOString(),
    error: undefined,
  });
  if (!generating) {
    await releaseClaim(job.id, styleId, claimToken);
    return { job: null, generated: false };
  }

  const original = generating.originalKey
    ? await getStorage().get(generating.originalKey)
    : null;
  if (!original) {
    const failed = await updateAsset(job.id, styleId, {
      status: "failed",
      error: "fatal",
    });
    await releaseClaim(job.id, styleId, claimToken);
    return { job: failed ?? generating, generated: false };
  }

  let result: Awaited<ReturnType<typeof runGeneration>>;
  try {
    result = await runGeneration(
      { image: original, styleId },
      {
        provider: getImageProvider(),
        onAttempt: () => incrementGenerations(),
        retryAll: true,
      },
    );
  } catch {
    result = { error: "fatal" };
  }

  if ("error" in result) {
    const failed = await updateAsset(job.id, styleId, {
      status: "failed",
      error: result.error as GenerateError,
    });
    // Failed styles are retryable: free the claim so an explicit retry works.
    await releaseClaim(job.id, styleId, claimToken);
    return { job: failed ?? generating, generated: true };
  }

  const fullKey = `blobs/${randomUUID()}.jpg`;
  let stored = false;
  try {
    await getStorage().put(fullKey, result.fullRes, "image/jpeg");
    stored = true;
  } catch {
    stored = false;
  }

  if (!stored) {
    const failed = await updateAsset(job.id, styleId, {
      status: "failed",
      error: "transient",
    });
    await releaseClaim(job.id, styleId, claimToken);
    return { job: failed ?? generating, generated: true };
  }

  const ready = await updateAsset(job.id, styleId, {
    status: "ready",
    fullKey,
    error: undefined,
  });
  if (!ready) {
    // The claim is freed so the stale `generating` asset can be reclaimed.
    await releaseClaim(job.id, styleId, claimToken);
    return { job: generating, generated: true };
  }
  // Keep the claim until its TTL: the asset is ready, so no legitimate caller
  // re-generates it, and a late racing caller is blocked.
  return { job: ready, generated: true };
}

/**
 * Cron sweeper for closed tabs: paid pack jobs whose extras have been pending
 * for at least a minute are expanded, bounded per run.
 */
export async function sweepPacks(
  now: Date = new Date(),
): Promise<{ jobs: number; expanded: number }> {
  const ids = await listJobIds();
  let budget = MAX_EXPANSIONS_PER_RUN;
  let jobs = 0;
  let expanded = 0;

  for (const id of ids) {
    if (budget <= 0) break;
    const job = await loadJob(id, now);
    if (!job || !isPaid(job) || job.product !== "pack") continue;
    if (!job.paidAt) continue;
    if (now.getTime() - new Date(job.paidAt).getTime() < PACK_SWEEP_MIN_AGE_MS) {
      continue;
    }
    if (!hasPendingAssets(job)) continue;

    jobs += 1;
    let current: Job | null = job;
    while (budget > 0 && current && hasPendingAssets(current)) {
      const result = await expandJob(id);
      if (!result.generated) break;
      expanded += 1;
      budget -= 1;
      current = result.job;
    }
  }

  return { jobs, expanded };
}
