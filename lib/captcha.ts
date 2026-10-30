import { turnstileEnforced, turnstileSecretKey, turnstileSiteKey } from "@/lib/env";

export type CaptchaFailure = "captcha_failed" | "captcha_timeout";
export type CaptchaResult = { ok: true } | { ok: false; reason: CaptchaFailure };

export interface CaptchaVerifier {
  verify(token: string | undefined): Promise<CaptchaResult>;
}

/** Off unless explicitly enabled with both keys present. */
export function captchaEnforced(): boolean {
  return turnstileEnforced() && Boolean(turnstileSiteKey()) && Boolean(turnstileSecretKey());
}

export function captchaSiteKey(): string | undefined {
  return captchaEnforced() ? turnstileSiteKey() : undefined;
}

const mockVerifier: CaptchaVerifier = {
  async verify() {
    return { ok: true };
  },
};

const TURNSTILE_TIMEOUT_MS = 5_000;

const turnstileVerifier: CaptchaVerifier = {
  async verify(token) {
    const secret = turnstileSecretKey();
    if (!secret || !token) return { ok: false, reason: "captcha_failed" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
    try {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token }).toString(),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return { ok: false, reason: "captcha_timeout" };
      }
      const payload = (await response.json()) as { success?: boolean };
      return payload.success ? { ok: true } : { ok: false, reason: "captcha_failed" };
    } catch {
      return { ok: false, reason: "captcha_timeout" };
    } finally {
      clearTimeout(timer);
    }
  },
};

export function getCaptchaVerifier(): CaptchaVerifier {
  return captchaEnforced() ? turnstileVerifier : mockVerifier;
}

export function verifyCaptcha(token: string | undefined): Promise<CaptchaResult> {
  return getCaptchaVerifier().verify(token);
}
