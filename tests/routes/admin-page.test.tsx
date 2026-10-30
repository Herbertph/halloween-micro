// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "hp_admin" && cookieState.value ? { value: cookieState.value } : undefined,
  }),
}));

import AdminPage from "@/app/admin/page";
import { createAdminCookieValue, ADMIN_COOKIE } from "@/lib/admin";
import {
  incrementGenerations,
  incrementPreviews,
  recordSale,
} from "@/lib/stats";
import { useTempDataDir } from "../helpers";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  process.env.ADMIN_PASSWORD = "test-admin-password";
  process.env.GENERATION_COST_CENTS = "4";
  cookieState.value = undefined;
});

afterEach(async () => {
  cookieState.value = undefined;
  process.env.GENERATION_COST_CENTS = "4";
  await cleanup();
});

async function seedDay() {
  const now = new Date();
  await incrementPreviews(now);
  await incrementPreviews(now);
  await incrementGenerations(5, now);
  await recordSale({ product: "single", amountCents: 499 }, now);
  await recordSale({ product: "pack", amountCents: 899 }, now);
}

describe("/admin", () => {
  it("AC-22: without a cookie the page is only a password form", async () => {
    await seedDay();
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain('id="admin-password"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("$13.98");
    expect(html).not.toContain("Single sales");
  });

  it("AC-23: authenticated aggregates match the scripted day (revenue $13.98)", async () => {
    await seedDay();
    cookieState.value = createAdminCookieValue();
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain("Previews generated");
    expect(html).toContain("Single sales");
    expect(html).toContain("Pack sales");
    expect(html).toContain("$13.98");
    // 5 generation attempts × 4 cents = $0.20 cost, margin $13.78.
    expect(html).toContain("$0.20");
    expect(html).toContain("$13.78");
    expect(html).toContain("Yesterday");
  });

  it("AC-24/AC-25: logging out removes the numbers and the page never renders private data", async () => {
    await seedDay();
    cookieState.value = createAdminCookieValue();
    const authed = renderToStaticMarkup(await AdminPage());
    expect(authed).toContain("$13.98");
    expect(authed).not.toMatch(/job_[0-9a-f]{8,}/);
    expect(authed).not.toContain("blobs/");
    expect(authed).not.toContain("<img");

    cookieState.value = undefined;
    const anonymous = renderToStaticMarkup(await AdminPage());
    expect(anonymous).not.toContain("$13.98");
    expect(anonymous).toContain('id="admin-password"');
  });

  it("keeps the cookie name explicit", () => {
    expect(ADMIN_COOKIE).toBe("hp_admin");
  });
});
