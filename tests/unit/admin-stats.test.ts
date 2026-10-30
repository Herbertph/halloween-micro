import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  adminCookieHeader,
  clearAdminCookieHeader,
  cookieValue,
  createAdminCookieValue,
  passwordMatches,
  verifyAdminCookieValue,
  ADMIN_SESSION_TTL_SECONDS,
} from "@/lib/admin";
import { dayKey, readDayStats, incrementPreviews, recordSale } from "@/lib/stats";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  process.env.ADMIN_PASSWORD = "test-admin-password";
});

afterEach(async () => {
  process.env.ADMIN_PASSWORD = "test-admin-password";
  await cleanup();
});

describe("admin session", () => {
  it("AC-24: signs an HttpOnly SameSite=Lax cookie that lasts eight hours", () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    const value = createAdminCookieValue(now);
    expect(verifyAdminCookieValue(value, now)).toBe(true);

    const [exp] = value.split(".");
    expect(Number(exp) - Math.floor(now.getTime() / 1000)).toBe(
      ADMIN_SESSION_TTL_SECONDS,
    );
    expect(ADMIN_SESSION_TTL_SECONDS).toBe(8 * 60 * 60);

    const header = adminCookieHeader(value);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain(`Max-Age=${8 * 60 * 60}`);
    expect(cookieValue(`other=1; ${header}`, "hp_admin")).toBe(value);

    // Eight hours and one second later the cookie is no longer valid.
    expect(
      verifyAdminCookieValue(
        value,
        new Date(now.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000 + 1000),
      ),
    ).toBe(false);
  });

  it("AC-24: logout clears the cookie", () => {
    expect(clearAdminCookieHeader()).toContain("Max-Age=0");
    expect(clearAdminCookieHeader()).toContain("HttpOnly");
  });

  it("compares passwords in constant time and fails closed when unset", () => {
    expect(passwordMatches("test-admin-password")).toBe(true);
    expect(passwordMatches("nope")).toBe(false);
    process.env.ADMIN_PASSWORD = "";
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches("anything")).toBe(false);
  });
});

describe("stats arithmetic", () => {
  it("AC-23: reads one UTC day record with previews, sales and revenue", async () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    await incrementPreviews(now);
    await incrementPreviews(now);
    await recordSale({ product: "single", amountCents: 499 }, now);
    await recordSale({ product: "pack", amountCents: 899 }, now);

    const stats = await readDayStats(dayKey(now));
    expect(stats).toEqual({
      previews: 2,
      generations: 0,
      salesSingle: 1,
      salesPack: 1,
      revenueCents: 1398,
    });
    expect(dayKey(now)).toBe("2026-10-30");
    expect((await readDayStats("2026-10-29")).revenueCents).toBe(0);
  });
});
