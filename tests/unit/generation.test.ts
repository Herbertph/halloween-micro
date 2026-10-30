import { describe, expect, it, vi } from "vitest";

import { runGeneration } from "@/lib/generation";
import type { GenerateError } from "@/lib/types";
import type { ImageProvider } from "@/lib/providers/image";

const input = { image: Buffer.from("image"), styleId: "pumpkin" as const };

function scriptedProvider(results: Array<{ fullRes: Buffer } | { error: GenerateError }>) {
  let index = 0;
  const generatePortrait = vi.fn(async () => {
    const result = results[Math.min(index, results.length - 1)];
    index += 1;
    return result;
  });
  return { provider: { generatePortrait } as ImageProvider, generatePortrait };
}

describe("generation retry policy", () => {
  it("AC-18: retries once after a transient failure and succeeds", async () => {
    const { provider, generatePortrait } = scriptedProvider([
      { error: "transient" },
      { fullRes: Buffer.from("portrait") },
    ]);
    const result = await runGeneration(input, { provider, timeoutMs: 1_000 });
    expect("fullRes" in result).toBe(true);
    expect(generatePortrait).toHaveBeenCalledTimes(2);
  });

  it("AC-18: fails after two transient failures without further attempts", async () => {
    const { provider, generatePortrait } = scriptedProvider([{ error: "transient" }]);
    const result = await runGeneration(input, { provider, timeoutMs: 1_000 });
    expect(result).toEqual({ error: "transient" });
    expect(generatePortrait).toHaveBeenCalledTimes(2);
  });

  it("AC-18: non-retryable errors return immediately", async () => {
    for (const error of ["no_subject", "moderation", "fatal"] as const) {
      const { provider, generatePortrait } = scriptedProvider([{ error }]);
      const result = await runGeneration(input, { provider, timeoutMs: 1_000 });
      expect(result).toEqual({ error });
      expect(generatePortrait).toHaveBeenCalledTimes(1);
    }
  });

  it("AC-19: abandons a slow attempt, retries once and reports timeout", async () => {
    const generatePortrait = vi.fn(
      () =>
        new Promise<{ fullRes: Buffer }>((resolve) => {
          setTimeout(() => resolve({ fullRes: Buffer.from("late") }), 400);
        }),
    );
    const provider: ImageProvider = { generatePortrait };
    const started = Date.now();
    const result = await runGeneration(input, { provider, timeoutMs: 40 });
    const elapsed = Date.now() - started;

    expect(result).toEqual({ error: "timeout" });
    expect(generatePortrait).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeLessThan(300);
  });
});
