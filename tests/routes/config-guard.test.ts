import { readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as checkout } from "@/app/api/checkout/route";
import { POST as generate } from "@/app/api/generate/route";
import { GET as health } from "@/app/api/health/route";
import { imageForm, jsonRequest } from "../helpers/jobs";
import { useTempDataDir } from "../helpers";

const ENV_KEYS = [
  "NODE_ENV",
  "ALLOW_MOCK_PROVIDERS",
  "PAYMENT_PROVIDER",
  "IMAGE_PROVIDER",
  "STORAGE_DRIVER",
  "KV_DRIVER",
  "GEMINI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "KV_REST_URL",
  "KV_REST_TOKEN",
  "DOWNLOAD_SIGNING_SECRET",
  "CRON_SECRET",
  "MOCK_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SITE_URL",
];

const SECRET_VALUES = {
  DOWNLOAD_SIGNING_SECRET: "guard-download-secret-1234",
  CRON_SECRET: "guard-cron-secret-1234",
  MOCK_WEBHOOK_SECRET: "guard-webhook-secret-1234",
  GEMINI_API_KEY: "guard-gemini-key-1234",
  STRIPE_SECRET_KEY: "guard-stripe-key-1234",
  STRIPE_WEBHOOK_SECRET: "guard-stripe-webhook-1234",
  BLOB_READ_WRITE_TOKEN: "guard-blob-token-1234",
  KV_REST_TOKEN: "guard-upstash-token-1234",
};

let snapshot: Record<string, string | undefined>;
let cleanup: () => Promise<void>;

function setEnv(values: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function liveEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    ALLOW_MOCK_PROVIDERS: undefined,
    PAYMENT_PROVIDER: "stripe",
    IMAGE_PROVIDER: "gemini",
    STORAGE_DRIVER: "vercel-blob",
    KV_DRIVER: "upstash",
    KV_REST_URL: "https://fake-upstash.example",
    NEXT_PUBLIC_SITE_URL: "https://haunted.example",
    ...SECRET_VALUES,
    ...overrides,
  };
}

beforeEach(async () => {
  snapshot = Object.fromEntries(ENV_KEYS.map((name) => [name, process.env[name]]));
  cleanup = await useTempDataDir();
});

afterEach(async () => {
  setEnv(snapshot);
  vi.restoreAllMocks();
  await cleanup();
});

describe("production guard", () => {
  it("G3-AC-1: production with mock payments refuses checkout with 503 and leaks no secret", async () => {
    setEnv(liveEnv({ PAYMENT_PROVIDER: "mock" }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await checkout(
      jsonRequest("http://localhost/api/checkout", { jobId: "job_x", product: "pack" }),
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text).error).toBe("misconfigured");
    for (const secret of Object.values(SECRET_VALUES)) {
      expect(text).not.toContain(secret);
    }
    expect(errors.mock.calls.flat().join(" ")).not.toContain(
      SECRET_VALUES.DOWNLOAD_SIGNING_SECRET,
    );
  });

  it("G3-AC-2: production with mock image or local drivers refuses generation before writing", async () => {
    setEnv(liveEnv({ IMAGE_PROVIDER: "mock", STORAGE_DRIVER: "local", KV_DRIVER: "local" }));
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const response = await generate(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "x-forwarded-for": "10.8.8.8" },
        body: imageForm(buffer),
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("misconfigured");

    const stored = await readdir(path.join(process.env.DATA_DIR!, "storage")).catch(
      () => [],
    );
    expect(stored).toEqual([]);
  });
});

describe("health endpoint", () => {
  it("G3-AC-4: live production config is ready and never echoes a key", async () => {
    setEnv(liveEnv());
    const response = await health();
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body).toEqual({ ready: true, mode: "live" });
    for (const secret of Object.values(SECRET_VALUES)) {
      expect(text).not.toContain(secret);
    }
  });

  it("G3-AC-5: a missing required variable is 503 and names it without values", async () => {
    setEnv(liveEnv({ GEMINI_API_KEY: undefined }));
    const response = await health();
    expect(response.status).toBe(503);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body.ready).toBe(false);
    expect(body.problems.join(" ")).toContain("GEMINI_API_KEY");
    for (const secret of Object.values(SECRET_VALUES)) {
      if (secret === SECRET_VALUES.GEMINI_API_KEY) continue;
      expect(text).not.toContain(secret);
    }
  });
});
