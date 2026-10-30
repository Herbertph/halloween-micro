import { describe, expect, it } from "vitest";

import { runVerifier } from "../support/verify-providers";

const SECRETS = {
  GEMINI_API_KEY: "gemini-secret-value-should-not-print",
  STRIPE_SECRET_KEY: "sk-secret-value-should-not-print",
  STRIPE_WEBHOOK_SECRET: "whsec-secret-value-should-not-print",
  BLOB_READ_WRITE_TOKEN: "blob-secret-value-should-not-print",
  KV_REST_TOKEN: "kv-secret-value-should-not-print",
  TURNSTILE_SECRET_KEY: "turnstile-secret-value-should-not-print",
  DOWNLOAD_SIGNING_SECRET: "download-secret-value-should-not-print",
  ADMIN_PASSWORD: "admin-password-should-not-print",
};

function configuredEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NEXT_PUBLIC_SITE_URL: "https://haunted.example",
    GEMINI_API_KEY: SECRETS.GEMINI_API_KEY,
    GEMINI_API_BASE: "http://gemini.local",
    STRIPE_SECRET_KEY: SECRETS.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: SECRETS.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_SINGLE_ID: "price_single_test",
    STRIPE_API_BASE: "http://stripe.local",
    BLOB_READ_WRITE_TOKEN: SECRETS.BLOB_READ_WRITE_TOKEN,
    KV_REST_URL: "http://kv.local",
    KV_REST_TOKEN: SECRETS.KV_REST_TOKEN,
    TURNSTILE_SECRET_KEY: SECRETS.TURNSTILE_SECRET_KEY,
    DOWNLOAD_SIGNING_SECRET: SECRETS.DOWNLOAD_SIGNING_SECRET,
    ADMIN_PASSWORD: SECRETS.ADMIN_PASSWORD,
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeHttp(
  options: { failStripe?: boolean; throwGemini?: boolean; emptyGemini?: boolean } = {},
) {
  const calls: string[] = [];
  const http = async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    if (url.startsWith("http://gemini.local")) {
      if (options.throwGemini) {
        throw new Error(`provider exploded with ${SECRETS.GEMINI_API_KEY}`);
      }
      return json({
        candidates: options.emptyGemini
          ? []
          : [
              {
                content: {
                  parts: [{ inlineData: { mimeType: "image/jpeg", data: "aW1hZ2U=" } }],
                },
              },
            ],
      });
    }
    if (url.startsWith("http://stripe.local")) {
      if (url.endsWith("/expire")) return json({});
      if (options.failStripe) {
        return new Response(`bad key ${SECRETS.STRIPE_SECRET_KEY}`, { status: 500 });
      }
      return json({ id: "cs_verifier_test" });
    }
    if (url === "http://kv.local") {
      const command = JSON.parse(String(init.body)) as string[];
      if (command[0] === "GET") return json({ result: "haunted-portrait-verifier" });
      if (command[0] === "DEL") return json({ result: 1 });
      return json({ result: "OK" });
    }
    if (url.startsWith("http://blob.local")) {
      if (url.endsWith("/delete")) return json({});
      if (init.method === "PUT") return json({});
      return new Response("haunted-portrait-verifier", { status: 200 });
    }
    if (url.includes("challenges.cloudflare.com")) {
      return json({ success: false });
    }
    return json({});
  };
  return { http, calls };
}

function allText(result: { lines: string[]; results: unknown[] }) {
  return JSON.stringify(result);
}

describe("verify:providers", () => {
  it("G3-AC-6: nothing configured exits 0 with SKIP for every service and calls nothing", async () => {
    let calls = 0;
    const http = async () => {
      calls += 1;
      return json({});
    };
    const result = await runVerifier({ env: {}, http, argv: [] });

    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.results).toHaveLength(5);
    expect(result.results.every((entry: { status: string }) => entry.status === "SKIP")).toBe(true);
    expect(result.lines.every((line) => line.includes("SKIP"))).toBe(true);
  });

  it("G3-AC-7: all configured services PASS against the stub, and one failure fails only that service", async () => {
    const passing = makeHttp();
    const all = await runVerifier({
      env: configuredEnv(),
      http: passing.http,
      argv: [],
      blobApiBase: "http://blob.local",
    });
    expect(all.exitCode).toBe(0);
    expect(all.results.map((entry: { status: string }) => entry.status)).toEqual([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
    ]);
    expect(passing.calls.some((call) => call.includes("/v1/checkout/sessions"))).toBe(true);
    expect(passing.calls.some((call) => call.includes("siteverify"))).toBe(true);

    const failing = makeHttp({ failStripe: true });
    const partial = await runVerifier({
      env: configuredEnv(),
      http: failing.http,
      argv: [],
      blobApiBase: "http://blob.local",
    });
    expect(partial.exitCode).toBe(1);
    const statuses = Object.fromEntries(
      partial.results.map((entry: { service: string; status: string }) => [
        entry.service,
        entry.status,
      ]),
    );
    expect(statuses).toEqual({
      Gemini: "PASS",
      Stripe: "FAIL",
      Blob: "PASS",
      Upstash: "PASS",
      Turnstile: "PASS",
    });
  });

  it("FR-4/FR-5: a Gemini response without an image is a verifier FAIL", async () => {
    const empty = makeHttp({ emptyGemini: true });
    const result = await runVerifier({
      env: configuredEnv(),
      http: empty.http,
      argv: [],
      blobApiBase: "http://blob.local",
    });
    const gemini = result.results.find(
      (entry: { service: string }) => entry.service === "Gemini",
    );
    expect(gemini?.status).toBe("FAIL");
    expect(result.exitCode).toBe(1);
  });

  it("G3-AC-8: pass, fail, verbose, crash and dry-run outputs never contain a secret", async () => {
    const scenarios = [
      await runVerifier({
        env: configuredEnv(),
        http: makeHttp().http,
        argv: [],
        blobApiBase: "http://blob.local",
      }),
      await runVerifier({
        env: configuredEnv(),
        http: makeHttp({ failStripe: true }).http,
        argv: ["--verbose"],
        blobApiBase: "http://blob.local",
      }),
      await runVerifier({
        env: configuredEnv(),
        http: makeHttp({ throwGemini: true }).http,
        argv: ["--verbose"],
        blobApiBase: "http://blob.local",
      }),
    ];

    for (const scenario of scenarios) {
      const output = allText(scenario);
      for (const secret of Object.values(SECRETS)) {
        expect(output).not.toContain(secret);
      }
    }
    expect(scenarios[2].results[0].status).toBe("FAIL");
  });

  it("G3-AC-6: --dry-run validates shape, prints PASS/PASS-style lines and calls nothing", async () => {
    let calls = 0;
    const http = async () => {
      calls += 1;
      return json({});
    };
    const result = await runVerifier({
      env: configuredEnv(),
      http,
      argv: ["--dry-run"],
      blobApiBase: "http://blob.local",
    });
    expect(calls).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.lines.every((line) => line.includes("dry run"))).toBe(true);
    for (const secret of Object.values(SECRETS)) {
      expect(allText(result)).not.toContain(secret);
    }

    const broken = await runVerifier({
      env: configuredEnv({ STRIPE_PRICE_SINGLE_ID: undefined, STRIPE_PRICE_PACK_ID: undefined }),
      http,
      argv: ["--dry-run"],
      blobApiBase: "http://blob.local",
    });
    expect(broken.exitCode).toBe(1);
    expect(
      broken.results.find((entry) => entry.service === "Stripe")?.status,
    ).toBe("FAIL");
  });
});
