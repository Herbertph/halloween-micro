import { afterEach, describe, expect, it } from "vitest";

import { adminCookieHeader, clearAdminCookieHeader } from "@/lib/admin";

const previousSite = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = previousSite;
});

describe("admin cookie security", () => {
  it("G3-AC-12: Secure on HTTPS, absent on HTTP, always HttpOnly and SameSite=Lax", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://haunted.example";
    const secure = adminCookieHeader("token");
    expect(secure).toContain("Secure");
    expect(secure).toContain("HttpOnly");
    expect(secure).toContain("SameSite=Lax");
    expect(clearAdminCookieHeader()).toContain("Secure");

    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const insecure = adminCookieHeader("token");
    expect(insecure).not.toContain("Secure");
    expect(insecure).toContain("HttpOnly");
    expect(insecure).toContain("SameSite=Lax");
  });
});
