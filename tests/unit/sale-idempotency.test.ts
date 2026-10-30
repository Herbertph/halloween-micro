import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readDayStats, recordSale } from "@/lib/stats";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;
let previousSite: string | undefined;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  previousSite = process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(async () => {
  process.env.NEXT_PUBLIC_SITE_URL = previousSite;
  await cleanup();
});

describe("sale idempotency", () => {
  it("G3-AC-11: the same session counts once, different sessions count twice", async () => {
    const now = new Date();

    expect(
      await recordSale(
        { sessionId: "cs_one", product: "pack", amountCents: 899 },
        now,
      ),
    ).toBe(true);
    expect(
      await recordSale(
        { sessionId: "cs_one", product: "pack", amountCents: 899 },
        now,
      ),
    ).toBe(false);
    expect(
      await recordSale(
        { sessionId: "cs_two", product: "single", amountCents: 499 },
        now,
      ),
    ).toBe(true);

    const { dayKey } = await import("@/lib/stats");
    const stats = await readDayStats(dayKey(now));
    expect(stats.salesPack).toBe(1);
    expect(stats.salesSingle).toBe(1);
    expect(stats.revenueCents).toBe(1398);
  });

  it("G3-AC-11: a retry after the first record does not drift the admin numbers", async () => {
    const now = new Date();
    await recordSale(
      { sessionId: "cs_retry", product: "pack", amountCents: 899 },
      now,
    );
    // Simulates a provider retry landing after a partial webhook failure.
    await recordSale(
      { sessionId: "cs_retry", product: "pack", amountCents: 899 },
      now,
    );
    const { dayKey } = await import("@/lib/stats");
    const stats = await readDayStats(dayKey(now));
    expect(stats.salesPack).toBe(1);
    expect(stats.revenueCents).toBe(899);
  });
});
