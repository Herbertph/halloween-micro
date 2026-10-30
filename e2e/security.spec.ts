import { expect, test } from "@playwright/test";

/** Issue #6: defence-in-depth headers on every production response. */
test("security headers are set on the landing page", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);

  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("microphone=()");

  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("form-action 'self'");
});
