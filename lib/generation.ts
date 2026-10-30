import { generationTimeoutMs } from "@/lib/env";
import type { GenerateError } from "@/lib/types";

import type { ImageProvider, ImageProviderInput, ImageProviderResult } from "./providers/image/types";

const RETRYABLE: GenerateError[] = ["transient", "timeout"];

export function isRetryable(error: GenerateError): boolean {
  return RETRYABLE.includes(error);
}

async function withTimeout(
  promise: Promise<ImageProviderResult>,
  timeoutMs: number,
): Promise<ImageProviderResult> {
  // Attach a handler so an abandoned provider promise cannot raise an
  // unhandled rejection after the race is lost.
  promise.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ImageProviderResult>((resolve) => {
    timer = setTimeout(() => resolve({ error: "timeout" }), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RunGenerationOptions {
  provider: ImageProvider;
  timeoutMs?: number;
  /** Total attempts, including the first one. */
  attempts?: number;
  /** Called before every provider attempt (used for cost stats). */
  onAttempt?: () => void | Promise<void>;
  /** Pack extras retry once even for non-transient errors (FR-10). */
  retryAll?: boolean;
}

/**
 * Single generation boundary with the retry policy: one retry for `transient`
 * and `timeout`, immediate failure for everything else.
 */
export async function runGeneration(
  input: ImageProviderInput,
  options: RunGenerationOptions,
): Promise<ImageProviderResult> {
  const timeoutMs = options.timeoutMs ?? generationTimeoutMs();
  const attempts = options.attempts ?? 2;
  let lastError: GenerateError = "fatal";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.onAttempt) {
      try {
        await options.onAttempt();
      } catch {
        // Stats must never break a generation.
      }
    }
    let result: ImageProviderResult;
    try {
      result = await withTimeout(options.provider.generatePortrait(input), timeoutMs);
    } catch {
      result = { error: "fatal" };
    }

    if ("fullRes" in result) return result;
    lastError = result.error;
    if (!options.retryAll && !isRetryable(lastError)) return result;
  }

  return { error: lastError };
}
