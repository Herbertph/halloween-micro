import { describe, expect, it } from "vitest";

import { bannerForDate, formatDateTimeUtc, formatPrice } from "@/lib/format";

describe("bannerForDate", () => {
  it("AC-2: says Halloween is today on October 31 (UTC)", () => {
    const banner = bannerForDate(new Date("2026-10-31T00:05:00Z"));
    expect(banner?.tone).toBe("today");
    expect(banner?.text).toContain("Halloween is today");
  });

  it("AC-2: says Halloween is tomorrow on October 30 (UTC)", () => {
    const banner = bannerForDate(new Date("2026-10-30T23:59:00Z"));
    expect(banner?.tone).toBe("tomorrow");
    expect(banner?.text).toContain("Halloween is tomorrow");
  });

  it("AC-2: is hidden on any other day", () => {
    expect(bannerForDate(new Date("2026-10-29T12:00:00Z"))).toBeNull();
    expect(bannerForDate(new Date("2026-11-01T00:00:00Z"))).toBeNull();
    expect(bannerForDate(new Date("2026-10-01T00:00:00Z"))).toBeNull();
  });
});

describe("formatting", () => {
  it("formats cents as dollars", () => {
    expect(formatPrice(499)).toBe("$4.99");
  });

  it("formats expiry deterministically in UTC", () => {
    expect(formatDateTimeUtc("2026-10-31T14:05:00.000Z")).toBe(
      "Oct 31, 2026, 14:05 UTC",
    );
  });
});
