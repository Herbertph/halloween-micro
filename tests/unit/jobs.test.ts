import { describe, expect, it } from "vitest";

import {
  canTransition,
  expiresAtFor,
  InvalidTransitionError,
  isExpired,
  toPublicJob,
  transition,
} from "@/lib/jobs";
import type { Job } from "@/lib/types";

const base: Job = {
  id: "job_1",
  createdAt: "2026-10-30T10:00:00.000Z",
  expiresAt: "2026-11-01T10:00:00.000Z",
  status: "created",
  styleId: "pumpkin",
  ipHash: "hash",
  originalKey: "blobs/original.jpg",
  fullKey: "blobs/full.jpg",
  previewKey: "blobs/preview.jpg",
};

describe("job state machine", () => {
  it("allows the documented one-way transitions", () => {
    expect(canTransition("created", "generating")).toBe(true);
    expect(canTransition("generating", "preview_ready")).toBe(true);
    expect(canTransition("generating", "failed")).toBe(true);
    expect(canTransition("preview_ready", "awaiting_payment")).toBe(true);
    expect(canTransition("awaiting_payment", "paid")).toBe(true);
    expect(canTransition("paid", "unlocked")).toBe(true);
    expect(canTransition("unlocked", "expired")).toBe(true);
  });

  it("rejects backwards and skipped transitions", () => {
    expect(canTransition("preview_ready", "paid")).toBe(false);
    expect(canTransition("paid", "preview_ready")).toBe(false);
    expect(canTransition("expired", "generating")).toBe(false);
    expect(() => transition({ ...base, status: "failed" }, "paid")).toThrow(
      InvalidTransitionError,
    );
  });

  it("stamps paid and unlocked timestamps", () => {
    const paid = transition({ ...base, status: "awaiting_payment" }, "paid", new Date("2026-10-30T11:00:00.000Z"));
    expect(paid.paidAt).toBe("2026-10-30T11:00:00.000Z");
    const unlocked = transition(paid, "unlocked", new Date("2026-10-30T11:00:01.000Z"));
    expect(unlocked.unlockedAt).toBe("2026-10-30T11:00:01.000Z");
  });

  it("computes retention expiry", () => {
    expect(expiresAtFor(new Date("2026-10-30T10:00:00.000Z"), 48)).toBe(
      "2026-11-01T10:00:00.000Z",
    );
    expect(isExpired(base, new Date("2026-11-01T10:00:01.000Z"))).toBe(true);
    expect(isExpired(base, new Date("2026-11-01T09:59:59.000Z"))).toBe(false);
  });

  it("AC-6/FR-18: never serialises storage keys in the public job", () => {
    const view = toPublicJob({ ...base, status: "preview_ready" });
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain("blobs/full.jpg");
    expect(serialised).not.toContain("fullKey");
    expect(serialised).not.toContain("originalKey");
    expect(view.previewUrl).toBe("/api/preview/job_1");
    expect(view.downloadUrl).toBeUndefined();
  });
});
