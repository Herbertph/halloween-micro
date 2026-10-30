import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as generate } from "@/app/api/generate/route";
import { GET as getPreview } from "@/app/api/preview/[id]/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { getStorage } from "@/lib/storage";
import { loadJob } from "@/lib/job-service";
import { resetLimitEnv, useTempDataDir } from "../helpers";
import { imageForm, jsonRequest } from "../helpers/jobs";

const { providerCalls } = vi.hoisted(() => ({ providerCalls: { count: 0 } }));

vi.mock("@/lib/providers/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/image")>();
  return {
    ...actual,
    getImageProvider: () => {
      const real = actual.getImageProvider();
      return {
        generatePortrait: async (input: Parameters<typeof real.generatePortrait>[0]) => {
          providerCalls.count += 1;
          return real.generatePortrait(input);
        },
      };
    },
  };
});

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "tests", "fixtures", name));
}

function request(form: FormData, ip: string): Request {
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
  process.env.PREVIEW_LIMIT_PER_IP = "100";
  providerCalls.count = 0;
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanup();
});

describe("POST /api/generate", () => {
  it("AC-3: rejects a GIF by magic bytes without calling the provider", async () => {
    const gif = Buffer.from("GIF89a" + "0".repeat(200));
    const response = await generate(
      request(imageForm(gif, { type: "image/gif", filename: "fun.gif" }), "10.0.0.1"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("unsupported_format");
    expect(providerCalls.count).toBe(0);
  });

  it("AC-4: rejects a body over 10 MB with a 4xx", async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024);
    const response = await generate(request(imageForm(huge), "10.0.0.2"));
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("file_too_large");
    expect(providerCalls.count).toBe(0);
  });

  it("AC-5: rejects a request without consent and never calls the provider", async () => {
    const buffer = await fixture("valid.jpg");
    const response = await generate(
      request(imageForm(buffer, { consent: null }), "10.0.0.3"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("consent_required");
    expect(providerCalls.count).toBe(0);
  });

  it("AC-6: returns only a watermarked preview URL, never a storage key", async () => {
    const buffer = await fixture("valid.jpg");
    const response = await generate(
      request(imageForm(buffer), "10.0.0.4"),
    );
    expect(response.status).toBe(202);
    const text = await response.text();
    const body = JSON.parse(text) as {
      jobId: string;
      status: string;
      previewUrl: string;
    };

    expect(body.status).toBe("preview_ready");
    expect(body.previewUrl).toBe(`/api/preview/${body.jobId}`);
    expect(text).not.toMatch(/blobs\//);
    expect(text).not.toMatch(/fullKey|originalKey/);
    expect(text).not.toMatch(/api\/download/);

    const previewResponse = await getPreview(
      new Request(`http://localhost${body.previewUrl}`),
      { params: Promise.resolve({ id: body.jobId }) },
    );
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get("content-type")).toBe("image/jpeg");
    const previewBytes = Buffer.from(await previewResponse.arrayBuffer());
    const metadata = await sharp(previewBytes).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(512);

    // The status endpoint stays equally silent about keys.
    const jobResponse = await getJob(
      new Request(`http://localhost/api/jobs/${body.jobId}`),
      { params: Promise.resolve({ id: body.jobId }) },
    );
    const jobText = await jobResponse.text();
    expect(jobText).not.toMatch(/blobs\//);
    expect(jobText).not.toMatch(/api\/download/);
  });

  it("AC-8: the stored original and the generated result carry no EXIF/GPS", async () => {
    const withExif = await fixture("gps.jpg");
    expect(withExif.includes(Buffer.from("Fixture Camera"))).toBe(true);

    const response = await generate(request(imageForm(withExif), "10.0.0.8"));
    expect(response.status).toBe(202);
    const body = (await response.json()) as { jobId: string };

    const job = await loadJob(body.jobId);
    expect(job?.originalKey).toBeTruthy();
    expect(job?.fullKey).toBeTruthy();

    const storage = getStorage();
    for (const key of [job!.originalKey!, job!.fullKey!]) {
      const bytes = await storage.get(key);
      expect(bytes).not.toBeNull();
      const metadata = await sharp(bytes!).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(bytes!.includes(Buffer.from("Fixture Camera"))).toBe(false);
    }
  });

  it("FR-9: a corrupt JPEG with valid magic bytes is a typed 4xx, not a 500", async () => {
    const truncated = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const response = await generate(request(imageForm(truncated), "10.0.0.9"));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(body.error).toBe("invalid_image");
    expect(providerCalls.count).toBe(0);
  });

  it("AC-9: a featureless image fails with no_subject and offers no checkout", async () => {
    const blank = await fixture("blank.jpg");
    const response = await generate(request(imageForm(blank), "10.0.0.5"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("failed");
    expect(body.error).toBe("no_subject");
    expect(providerCalls.count).toBe(1);

    const checkoutResponse = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: body.jobId }),
    );
    expect(checkoutResponse.status).toBe(409);
  });

  it("AC-16: allows 3 previews per IP in 24 h, rejects the 4th, then allows after the window", async () => {
    process.env.PREVIEW_LIMIT_PER_IP = "3";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T10:00:00.000Z"));

    const buffer = await fixture("valid.jpg");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await generate(request(imageForm(buffer), "10.1.1.1"));
      expect(response.status).toBe(202);
    }

    const rejected = await generate(request(imageForm(buffer), "10.1.1.1"));
    expect(rejected.status).toBe(429);
    const rejectedBody = await rejected.json();
    expect(rejectedBody.error).toBe("rate_limited");
    expect(typeof rejectedBody.retryAt).toBe("string");
    expect(Number.isNaN(Date.parse(rejectedBody.retryAt))).toBe(false);

    const callsBefore = providerCalls.count;
    vi.setSystemTime(new Date("2026-10-31T10:00:01.000Z"));
    const allowedAgain = await generate(request(imageForm(buffer), "10.1.1.1"));
    expect(allowedAgain.status).toBe(202);
    expect(providerCalls.count).toBe(callsBefore + 1);
  });

  it("AC-17: refuses generation at the daily cap without calling the provider", async () => {
    process.env.DAILY_GENERATION_CAP = "1";
    const buffer = await fixture("valid.jpg");

    const first = await generate(request(imageForm(buffer), "10.0.0.6"));
    expect(first.status).toBe(202);
    const callsAfterFirst = providerCalls.count;

    const refused = await generate(request(imageForm(buffer), "10.0.0.7"));
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toBe("capacity");
    expect(providerCalls.count).toBe(callsAfterFirst);
  });
});
