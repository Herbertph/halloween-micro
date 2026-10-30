import { afterEach, describe, expect, it } from "vitest";

import {
  captchaEnforced,
  captchaSiteKey,
  verifyCaptcha,
} from "@/lib/captcha";

afterEach(() => {
  process.env.TURNSTILE_ENFORCED = "false";
  process.env.TURNSTILE_SITE_KEY = "";
  process.env.TURNSTILE_SECRET_KEY = "";
});

describe("captcha configuration", () => {
  it("AC-20: is off by default, so no widget and a no-op verifier", async () => {
    process.env.TURNSTILE_ENFORCED = "false";
    process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    process.env.TURNSTILE_SECRET_KEY = "1x00000000000000000000000000000000AA";

    expect(captchaEnforced()).toBe(false);
    expect(captchaSiteKey()).toBeUndefined();
    expect(await verifyCaptcha(undefined)).toEqual({ ok: true });
  });

  it("AC-19: requires both keys and the explicit flag to enforce", () => {
    process.env.TURNSTILE_ENFORCED = "true";
    process.env.TURNSTILE_SITE_KEY = "";
    process.env.TURNSTILE_SECRET_KEY = "";
    expect(captchaEnforced()).toBe(false);
    expect(captchaSiteKey()).toBeUndefined();

    process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    process.env.TURNSTILE_SECRET_KEY = "1x00000000000000000000000000000000AA";
    expect(captchaEnforced()).toBe(true);
    expect(captchaSiteKey()).toBe("1x00000000000000000000AA");
  });

  it("AC-18: a missing token fails without any network call", async () => {
    process.env.TURNSTILE_ENFORCED = "true";
    process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    process.env.TURNSTILE_SECRET_KEY = "1x00000000000000000000000000000000AA";
    expect(await verifyCaptcha(undefined)).toEqual({
      ok: false,
      reason: "captcha_failed",
    });
  });
});
