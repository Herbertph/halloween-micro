import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as generate } from "@/app/api/generate/route";
import { getKv } from "@/lib/kv";
import type { CaptchaResult } from "@/lib/captcha";
import { resetLimitEnv, useTempDataDir } from "../helpers";
import { imageForm } from "../helpers/jobs";

const { captchaState } = vi.hoisted(() => ({
  captchaState: { result: { ok: true } as CaptchaResult },
}));

vi.mock("@/lib/captcha", () => ({
  verifyCaptcha: async () => captchaState.result,
  captchaEnforced: () => true,
  captchaSiteKey: () => "1x00000000000000000000AA",
}));

async function fixture(): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  return readFile(path.join(process.cwd(), "tests", "fixtures", "valid.jpg"));
}

function request(form: FormData, ip = "10.7.7.7"): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: form,
  });
}

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  resetLimitEnv();
  captchaState.result = { ok: true };
});

afterEach(async () => {
  await cleanup();
});

describe("Turnstile enforcement", () => {
  it("AC-18: a rejected token is 400 and leaves the quota untouched", async () => {
    const buffer = await fixture();
    captchaState.result = { ok: false, reason: "captcha_failed" };

    const rejected = await generate(request(imageForm(buffer)));
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toBe("captcha_failed");
    expect(await getKv().setMembers("jobs:index")).toHaveLength(0);

    // The same IP can still generate afterwards: no preview quota was consumed.
    captchaState.result = { ok: true };
    const accepted = await generate(request(imageForm(buffer)));
    expect(accepted.status).toBe(202);
    expect(await getKv().setMembers("jobs:index")).toHaveLength(1);
  });

  it("AC-19: a passing verifier lets generation work as before", async () => {
    const buffer = await fixture();
    const response = await generate(
      request(imageForm(buffer), "10.7.7.8"),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("preview_ready");
    expect(body.previewUrl).toBeTruthy();
  });

  it("AC-21: a verifier timeout is friendly, retryable and unlocks nothing", async () => {
    const buffer = await fixture();
    captchaState.result = { ok: false, reason: "captcha_timeout" };
    const form = imageForm(buffer);
    form.set("turnstileToken", "token-that-must-not-leak");

    const response = await generate(request(form, "10.7.7.9"));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text).error).toBe("captcha_timeout");
    expect(text).not.toContain("token-that-must-not-leak");
    expect(await getKv().setMembers("jobs:index")).toHaveLength(0);
  });
});
