import { getKv } from "@/lib/kv";
import { dailyGenerationCap, previewLimitPerIp } from "@/lib/env";

export const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAt: Date };

/**
 * Rolling 24 h window per client IP. The check and the write happen together so
 * a rejected attempt never consumes budget.
 */
export async function consumePreviewAttempt(
  ipHash: string,
  now: Date = new Date(),
): Promise<LimitResult> {
  const limit = previewLimitPerIp();
  const kv = getKv();
  const key = `rl:preview:${ipHash}`;
  const raw = await kv.get(key);
  let attempts: number[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        attempts = parsed.filter(
          (value): value is number =>
            typeof value === "number" && value > now.getTime() - RATE_WINDOW_MS,
        );
      }
    } catch {
      attempts = [];
    }
  }
  attempts.sort((a, b) => a - b);

  if (attempts.length >= limit) {
    const retryAt = new Date(attempts[0] + RATE_WINDOW_MS);
    return { allowed: false, retryAt };
  }

  attempts.push(now.getTime());
  await kv.set(key, JSON.stringify(attempts), {
    exSeconds: Math.ceil(RATE_WINDOW_MS / 1000) + 60,
  });
  return { allowed: true, remaining: Math.max(0, limit - attempts.length) };
}

export function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Global daily cap; a refused attempt never increments the counter. */
export async function consumeDailyGeneration(
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const cap = dailyGenerationCap();
  const key = `cap:generations:${utcDateKey(now)}`;
  const kv = getKv();
  const current = Number((await kv.get(key)) ?? "0");
  if (Number.isFinite(current) && current >= cap) {
    return { allowed: false };
  }
  await kv.incr(key, 48 * 60 * 60);
  return { allowed: true };
}
