import { randomUUID } from "node:crypto";

import { getKv } from "@/lib/kv";
import { dailyGenerationCap, previewLimitPerIp } from "@/lib/env";

export const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAt: Date };

/**
 * Rolling 24 h window per client IP. The add, prune and count happen in one
 * atomic KV operation, so parallel requests cannot read the same stale count.
 */
export async function consumePreviewAttempt(
  ipHash: string,
  now: Date = new Date(),
): Promise<LimitResult> {
  const limit = previewLimitPerIp();
  const result = await getKv().addToRollingWindow({
    key: `rl:preview:${ipHash}`,
    member: randomUUID(),
    score: now.getTime(),
    windowMs: RATE_WINDOW_MS,
    limit,
    ttlSeconds: Math.ceil(RATE_WINDOW_MS / 1000) + 60,
  });

  if (!result.allowed) {
    return { allowed: false, retryAt: new Date(result.oldest + RATE_WINDOW_MS) };
  }
  return { allowed: true, remaining: Math.max(0, limit - result.count) };
}

export function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Global daily cap; the counter increment is atomic. */
export async function consumeDailyGeneration(
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const cap = dailyGenerationCap();
  const key = `cap:generations:${utcDateKey(now)}`;
  const current = await getKv().incr(key, 48 * 60 * 60);
  return { allowed: current <= cap };
}
