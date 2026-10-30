import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as login } from "@/app/api/admin/login/route";
import { POST as logout } from "@/app/api/admin/logout/route";
import { createAdminCookieValue, ADMIN_COOKIE } from "@/lib/admin";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  const { useTempDataDir } = await import("../helpers");
  cleanup = await useTempDataDir();
  process.env.ADMIN_PASSWORD = "test-admin-password";
});

afterEach(async () => {
  process.env.ADMIN_PASSWORD = "test-admin-password";
  await cleanup();
});

function loginRequest(password: string, ip: string): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  });
}

describe("admin login", () => {
  it("AC-22: wrong passwords return 401 and repeated attempts return 429", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login(loginRequest("wrong", "10.5.5.5"));
      expect(response.status).toBe(401);
    }
    const blocked = await login(loginRequest("wrong", "10.5.5.5"));
    expect(blocked.status).toBe(429);
  });

  it("AC-24: a correct password sets an HttpOnly SameSite=Lax 8 h cookie", async () => {
    const response = await login(loginRequest("test-admin-password", "10.5.5.6"));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ADMIN_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=28800");
    const value = cookie.split(";")[0].split("=").slice(1).join("=");
    expect(value).toBeTruthy();
    expect(value).not.toBe("undefined");
  });

  it("AC-24: logout clears the cookie", async () => {
    const response = await logout();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a missing password", async () => {
    const response = await login(
      new Request("http://localhost/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.5.5.7" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("admin cookie value", () => {
  it("AC-24: is signed with a distinct context and expires after eight hours", () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    const value = createAdminCookieValue(now);
    expect(value.split(".")[0]).toBe(
      String(Math.floor(now.getTime() / 1000) + 8 * 60 * 60),
    );
  });
});
