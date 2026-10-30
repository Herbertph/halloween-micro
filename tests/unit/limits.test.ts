import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { consumeDailyGeneration, consumePreviewAttempt } from "@/lib/limits";
import { resetLimitEnv, useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  resetLimitEnv();
});

afterEach(async () => {
  await cleanup();
});

describe("per-IP rolling window", () => {
  it("AC-16: allows three previews, rejects the fourth with a retry time, and frees up 24 h later", async () => {
    const start = new Date("2026-10-30T10:00:00.000Z");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await consumePreviewAttempt("ip-hash", start);
      expect(result.allowed).toBe(true);
    }

    const rejected = await consumePreviewAttempt("ip-hash", start);
    expect(rejected.allowed).toBe(false);
    if (!rejected.allowed) {
      expect(rejected.retryAt.getTime()).toBe(start.getTime() + 24 * 60 * 60 * 1000);
    }

    const later = new Date(start.getTime() + 24 * 60 * 60 * 1000 + 1000);
    const allowedAgain = await consumePreviewAttempt("ip-hash", later);
    expect(allowedAgain.allowed).toBe(true);
  });

  it("counts windows per IP", async () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    await consumePreviewAttempt("ip-a", now);
    await consumePreviewAttempt("ip-a", now);
    await consumePreviewAttempt("ip-a", now);
    expect((await consumePreviewAttempt("ip-a", now)).allowed).toBe(false);
    expect((await consumePreviewAttempt("ip-b", now)).allowed).toBe(true);
  });
});

describe("global daily cap", () => {
  it("AC-17: refuses once the cap is reached and does not increment further", async () => {
    process.env.DAILY_GENERATION_CAP = "2";
    const now = new Date("2026-10-30T10:00:00.000Z");
    expect((await consumeDailyGeneration(now)).allowed).toBe(true);
    expect((await consumeDailyGeneration(now)).allowed).toBe(true);
    expect((await consumeDailyGeneration(now)).allowed).toBe(false);
    expect((await consumeDailyGeneration(now)).allowed).toBe(false);
  });

  it("resets on a new UTC day", async () => {
    process.env.DAILY_GENERATION_CAP = "1";
    expect(
      (await consumeDailyGeneration(new Date("2026-10-30T23:00:00.000Z"))).allowed,
    ).toBe(true);
    expect(
      (await consumeDailyGeneration(new Date("2026-10-31T01:00:00.000Z"))).allowed,
    ).toBe(true);
  });
});
