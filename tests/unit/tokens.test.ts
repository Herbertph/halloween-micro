import { describe, expect, it } from "vitest";

import { signDownloadToken, verifyDownloadToken } from "@/lib/tokens";

describe("download tokens", () => {
  it("AC-21: accepts a freshly signed token", () => {
    const token = signDownloadToken({
      jobId: "job_1",
      key: "blobs/abc.jpg",
      exp: Date.now() + 60_000,
    });
    const verified = verifyDownloadToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.jobId).toBe("job_1");
      expect(verified.key).toBe("blobs/abc.jpg");
    }
  });

  it("AC-21: rejects a tampered token as invalid", () => {
    const token = signDownloadToken({
      jobId: "job_1",
      key: "blobs/abc.jpg",
      exp: Date.now() + 60_000,
    });
    const [payload, signature] = token.split(".");
    const tamperedSignature =
      (signature[0] === "a" ? "b" : "a") + signature.slice(1);
    const tamperedPayload = Buffer.from(
      JSON.stringify({ j: "job_2", k: "blobs/other.jpg", e: Date.now() + 60_000 }),
    ).toString("base64url");

    expect(verifyDownloadToken(`${payload}.${tamperedSignature}`)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(verifyDownloadToken(`${tamperedPayload}.${signature}`)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("AC-21: rejects an expired token as expired", () => {
    const token = signDownloadToken({
      jobId: "job_1",
      key: "blobs/abc.jpg",
      exp: Date.now() - 1_000,
    });
    expect(verifyDownloadToken(token)).toEqual({ ok: false, reason: "expired" });
  });
});
