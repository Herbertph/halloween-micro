import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as assetsRoute } from "@/app/api/assets/[jobId]/[styleId]/route";
import { GET as cronExpand } from "@/app/api/cron/expand-packs/route";
import { GET as download } from "@/app/api/download/route";
import { POST as expand } from "@/app/api/jobs/[id]/expand/route";
import { GET as jobsRoute } from "@/app/api/jobs/[id]/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as webhook } from "@/app/api/webhooks/payments/route";
import { normalizeJob } from "@/lib/assets";
import { sweepPacks } from "@/lib/expand";
import { cleanupExpiredJobs, loadJob, saveJob } from "@/lib/job-service";
import {
  MOCK_SIGNATURE_HEADER,
  mockWebhookBody,
  signMockWebhook,
} from "@/lib/providers/payments/mock";
import { getStorage } from "@/lib/storage";
import { signDownloadToken, signShareToken } from "@/lib/tokens";
import type { PublicJob, StyleId } from "@/lib/types";
import { resetLimitEnv, useTempDataDir } from "../helpers";
import { jsonRequest } from "../helpers/jobs";
import { makePaidPackJob, makePreviewPackJob } from "../helpers/packs";

const { providerState } = vi.hoisted(() => ({
  providerState: {
    calls: [] as string[],
    failNext: new Map<string, number>(),
  },
}));

vi.mock("@/lib/providers/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/image")>();
  return {
    ...actual,
    getImageProvider: () => {
      const real = actual.getImageProvider();
      return {
        generatePortrait: async (input: Parameters<typeof real.generatePortrait>[0]) => {
          providerState.calls.push(input.styleId);
          const remaining = providerState.failNext.get(input.styleId) ?? 0;
          if (remaining > 0) {
            providerState.failNext.set(input.styleId, remaining - 1);
            return { error: "transient" as const };
          }
          return real.generatePortrait(input);
        },
      };
    },
  };
});

let cleanup: () => Promise<void>;

beforeEach(async () => {
  cleanup = await useTempDataDir();
  resetLimitEnv();
  providerState.calls = [];
  providerState.failNext = new Map();
});

afterEach(async () => {
  await cleanup();
});

function webhookRequest(body: string): Request {
  return new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [MOCK_SIGNATURE_HEADER]: signMockWebhook(body),
    },
    body,
  });
}

async function expandOnce(
  jobId: string,
  sessionId: string,
  styleId?: StyleId,
): Promise<{ status: number; job?: PublicJob; error?: string }> {
  const search = new URLSearchParams({ session: sessionId });
  if (styleId) search.set("style", styleId);
  const response = await expand(
    new Request(`http://localhost/api/jobs/${jobId}/expand?${search}`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: jobId }) },
  );
  const body = (await response.json()) as { job?: PublicJob; error?: string };
  return { status: response.status, ...body };
}

async function expandAll(jobId: string, sessionId: string): Promise<PublicJob> {
  let job: PublicJob | undefined;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await expandOnce(jobId, sessionId);
    if (result.status !== 200 || !result.job) break;
    job = result.job;
    const pending = (job.assets ?? []).some(
      (asset) => asset.status === "pending" || asset.status === "generating",
    );
    if (!pending) break;
  }
  if (!job) throw new Error("expand did not return a job");
  return job;
}

async function jobView(jobId: string, sessionId: string) {
  const response = await jobsRoute(
    new Request(`http://localhost/api/jobs/${jobId}?session=${sessionId}`),
    { params: Promise.resolve({ id: jobId }) },
  );
  return {
    status: response.status,
    body: (await response.json()) as { job: PublicJob; payment?: string },
  };
}

async function fetchDownload(url: string): Promise<Response> {
  return download(new Request(`http://localhost${url}`));
}

describe("pack purchase", () => {
  it("AC-5: paying for a pack unlocks four assets with exactly three extra calls", async () => {
    const { job, sessionId } = await makePaidPackJob();
    const final = await expandAll(job.id, sessionId);

    expect(providerState.calls).toHaveLength(3);
    expect(new Set(providerState.calls).size).toBe(3);
    expect(providerState.calls).not.toContain(job.styleId);
    expect(final.assets).toHaveLength(4);
    expect(final.assets?.every((asset) => asset.status === "ready")).toBe(true);

    const bytes: string[] = [];
    for (const asset of final.assets ?? []) {
      expect(asset.downloadUrl).toBeTruthy();
      const response = await fetchDownload(asset.downloadUrl!);
      expect(response.status).toBe(200);
      bytes.push(Buffer.from(await response.arrayBuffer()).toString("base64"));
    }
    expect(new Set(bytes).size).toBe(4);
  });

  it("AC-6: a single purchase unlocks one asset and generates no extras", async () => {
    const { job, sessionId } = await makePaidPackJob({ product: "single" });
    const final = await expandAll(job.id, sessionId);

    expect(final.product).toBe("single");
    expect(final.assets).toHaveLength(1);
    expect(final.assets?.[0].status).toBe("ready");
    expect(providerState.calls).toHaveLength(0);
  });

  it("AC-7: before payment only the chosen preview is reachable", async () => {
    const job = await makePreviewPackJob("pumpkin");
    const checkoutResponse = await checkout(
      jsonRequest("http://localhost/api/checkout", {
        jobId: job.id,
        product: "pack",
      }),
    );
    const { sessionId } = (await checkoutResponse.json()) as { sessionId: string };

    const view = await jobView(job.id, sessionId);
    expect(view.status).toBe(200);
    expect(view.body.job.product).toBeUndefined();
    expect(view.body.job.downloadUrl).toBeUndefined();
    expect(view.body.job.shareUrl).toBeUndefined();
    expect(view.body.job.assets).toHaveLength(4);

    const chosen = view.body.job.assets?.find(
      (asset) => asset.styleId === job.styleId,
    );
    expect(chosen?.previewUrl).toBeTruthy();
    expect(chosen?.downloadUrl).toBeUndefined();
    for (const asset of view.body.job.assets ?? []) {
      if (asset.styleId !== job.styleId) {
        expect(asset.previewUrl).toBeUndefined();
        expect(asset.downloadUrl).toBeUndefined();
      }
    }

    const assetResponse = await assetsRoute(
      new Request(
        `http://localhost/api/assets/${job.id}/witch?session=${sessionId}`,
      ),
      { params: Promise.resolve({ jobId: job.id, styleId: "witch" }) },
    );
    expect(assetResponse.status).toBe(403);

    const current = await loadJob(job.id);
    const downloadToken = signDownloadToken({
      jobId: job.id,
      key: current!.fullKey!,
      styleId: current!.styleId,
      exp: Date.now() + 60_000,
    });
    expect(
      (
        await download(
          new Request(
            `http://localhost/api/download?token=${encodeURIComponent(downloadToken)}`,
          ),
        )
      ).status,
    ).toBe(410);

    const shareToken = signShareToken({
      jobId: job.id,
      styleId: job.styleId,
      exp: Date.now() + 60_000,
    });
    const shareResponse = await import("@/app/api/share/route").then((module) =>
      module.GET(
        new Request(
          `http://localhost/api/share?token=${encodeURIComponent(shareToken)}`,
        ),
      ),
    );
    expect(shareResponse.status).toBe(403);
  });

  it("AC-8: a duplicate webhook creates no extra styles and unlocks once", async () => {
    const job = await makePreviewPackJob("pumpkin");
    const checkoutResponse = await checkout(
      jsonRequest("http://localhost/api/checkout", {
        jobId: job.id,
        product: "pack",
      }),
    );
    const { sessionId } = (await checkoutResponse.json()) as { sessionId: string };
    const payload = mockWebhookBody({
      eventId: "evt_pack_duplicate",
      sessionId,
      jobId: job.id,
    });

    expect((await webhook(webhookRequest(payload))).status).toBe(200);
    const first = await loadJob(job.id);
    expect(first?.status).toBe("unlocked");
    expect(first?.assets?.filter((asset) => asset.status === "pending")).toHaveLength(3);
    expect(providerState.calls).toHaveLength(0);

    expect((await webhook(webhookRequest(payload))).status).toBe(200);
    const second = await loadJob(job.id);
    expect(second?.assets?.filter((asset) => asset.status === "pending")).toHaveLength(3);
    expect(second?.paidAt).toBe(first?.paidAt);

    await expandAll(job.id, sessionId);
    expect(providerState.calls).toHaveLength(3);
  });

  it("AC-9: concurrent expansions claim distinct styles and never duplicate work", async () => {
    const { job, sessionId } = await makePaidPackJob();
    await Promise.all([
      expandOnce(job.id, sessionId),
      expandOnce(job.id, sessionId),
      expandOnce(job.id, sessionId),
    ]);
    const final = await expandAll(job.id, sessionId);
    expect(providerState.calls).toHaveLength(3);
    expect(new Set(providerState.calls).size).toBe(3);
    expect(final.assets?.every((asset) => asset.status === "ready")).toBe(true);

    // Cron + client together still produce exactly three extras.
    providerState.calls = [];
    const second = await makePaidPackJob({
      paidAt: new Date(Date.now() - 120_000),
    });
    await Promise.all([
      expandOnce(second.job.id, second.sessionId),
      sweepPacks(),
    ]);
    await expandAll(second.job.id, second.sessionId);
    expect(providerState.calls).toHaveLength(3);
    expect(new Set(providerState.calls).size).toBe(3);
  });

  it("AC-10: the cron sweeper needs the secret and delivers a closed-tab pack", async () => {
    const { job } = await makePaidPackJob({
      paidAt: new Date(Date.now() - 120_000),
    });

    const unauthorized = await cronExpand(
      new Request("http://localhost/api/cron/expand-packs"),
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await cronExpand(
      new Request("http://localhost/api/cron/expand-packs", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(authorized.status).toBe(200);
    const result = (await authorized.json()) as { expanded: number };
    expect(result.expanded).toBeGreaterThanOrEqual(1);

    const reloaded = await loadJob(job.id);
    expect(reloaded?.assets).toHaveLength(4);
    expect(reloaded?.assets?.every((asset) => asset.status === "ready")).toBe(true);
    expect(providerState.calls).toHaveLength(3);
  });

  it("AC-11: one failed style can be retried without regenerating the ready ones", async () => {
    const { job, sessionId } = await makePaidPackJob();
    providerState.failNext.set("witch", 2);

    await expandAll(job.id, sessionId);
    const failedView = await jobView(job.id, sessionId);
    const failedAsset = failedView.body.job.assets?.find(
      (asset) => asset.styleId === "witch",
    );
    expect(failedAsset?.status).toBe("failed");
    expect(failedAsset?.error).toBe("transient");
    expect(
      failedView.body.job.assets?.filter((asset) => asset.status === "ready"),
    ).toHaveLength(3);

    const retry = await expandOnce(job.id, sessionId, "witch");
    expect(retry.status).toBe(200);
    const retried = retry.job?.assets?.find((asset) => asset.styleId === "witch");
    expect(retried?.status).toBe("ready");

    const counts = providerState.calls.reduce<Record<string, number>>(
      (acc, style) => ({ ...acc, [style]: (acc[style] ?? 0) + 1 }),
      {},
    );
    expect(counts.vampire).toBe(1);
    expect(counts.zombie).toBe(1);
    expect(counts.witch).toBe(3);
    expect(counts.pumpkin).toBeUndefined();
  });

  it("AC-12: pack assets are deleted with retention and URLs answer 410", async () => {
    const { job, sessionId } = await makePaidPackJob();
    const view = await jobView(job.id, sessionId);
    const current = await loadJob(job.id);
    const assetKeys = (normalizeJob(current!).assets ?? [])
      .map((asset) => asset.fullKey)
      .filter((key): key is string => Boolean(key));
    const downloadUrl = view.body.job.assets?.[0].downloadUrl!;
    const shareUrl = view.body.job.shareUrl!;

    await saveJob({
      ...current!,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    await cleanupExpiredJobs(new Date());

    for (const key of assetKeys) {
      expect(await getStorage().get(key)).toBeNull();
    }
    expect((await fetchDownload(downloadUrl)).status).toBe(410);
    const shareResponse = await import("@/app/api/share/route").then((module) =>
      module.GET(new Request(`http://localhost${shareUrl}`)),
    );
    expect(shareResponse.status).toBe(410);
  });
});
