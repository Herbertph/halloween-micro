import { describe, expect, it } from "vitest";

import { signDownloadToken, signShareToken, verifyShareToken } from "@/lib/tokens";

describe("share tokens", () => {
  it("AC-15: accepts a fresh token and rejects a forged one", () => {
    const token = signShareToken({
      jobId: "job_1",
      styleId: "witch",
      exp: Date.now() + 60_000,
    });
    const verified = verifyShareToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.jobId).toBe("job_1");
      expect(verified.styleId).toBe("witch");
    }

    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${(signature[0] === "a" ? "b" : "a") + signature.slice(1)}`;
    expect(verifyShareToken(tampered)).toEqual({ ok: false, reason: "invalid" });
  });

  it("AC-15: rejects an expired share token as expired", () => {
    const token = signShareToken({
      jobId: "job_1",
      styleId: "witch",
      exp: Date.now() - 1_000,
    });
    expect(verifyShareToken(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("AC-15: a download token cannot be replayed as a share token", () => {
    const download = signDownloadToken({
      jobId: "job_1",
      key: "blobs/x.jpg",
      exp: Date.now() + 60_000,
    });
    expect(verifyShareToken(download)).toEqual({ ok: false, reason: "invalid" });
  });
});
