// One-command provider check. It uses only configured services, never prints a
// secret, and takes an injectable HTTP layer so the suite can run it offline.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const SECRET_NAMES = [
  "DOWNLOAD_SIGNING_SECRET",
  "MOCK_WEBHOOK_SECRET",
  "CRON_SECRET",
  "GEMINI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "KV_REST_TOKEN",
  "TURNSTILE_SECRET_KEY",
  "ADMIN_PASSWORD",
];

export function redact(text, env = process.env) {
  let output = String(text ?? "");
  const secrets = SECRET_NAMES.map((name) => env[name])
    .filter((value) => typeof value === "string" && value.length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) {
    output = output.split(secret).join("[redacted]");
  }
  return output;
}

function firstLine(text) {
  const line = String(text ?? "").split(/\r?\n/)[0].trim();
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}

async function bodyText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function statusFailure(response, service) {
  const body = await bodyText(response);
  return {
    status: "FAIL",
    reason: `${service} HTTP ${response.status}: ${firstLine(body) || "no body"}`,
  };
}

function ok(status = "PASS", reason = "ok") {
  return { status, reason };
}

function trimBase(url) {
  return (url || "").replace(/\/+$/, "");
}

function stripePriceId(env) {
  return env.STRIPE_PRICE_SINGLE_ID || env.STRIPE_PRICE_PACK_ID || "";
}

async function probeGemini(env, http) {
  const base = trimBase(env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com");
  const model = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const response = await http(
    `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "A tiny Halloween pumpkin." }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
  );
  if (!response.ok) return statusFailure(response, "Gemini");

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: "FAIL", reason: "Gemini returned invalid JSON" };
  }
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const image = candidates
    .flatMap((candidate) => (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []))
    .find(
      (part) =>
        typeof part?.inlineData?.data === "string" && part.inlineData.data.length > 0,
    );
  if (!image) {
    return {
      status: "FAIL",
      reason: "Gemini returned no image part (wrong model, text-only or blocked)",
    };
  }
  return ok("PASS", `HTTP ${response.status} with an image part`);
}

async function probeStripe(env, http) {
  const priceId = stripePriceId(env);
  if (!priceId) {
    return { status: "FAIL", reason: "missing STRIPE_PRICE_SINGLE_ID" };
  }
  const base = trimBase(env.STRIPE_API_BASE || "https://api.stripe.com");
  const site = trimBase(env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/create?cancelled=1`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
  });
  const create = await http(`${base}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!create.ok) return statusFailure(create, "Stripe");
  let session;
  try {
    session = await create.json();
  } catch {
    return { status: "FAIL", reason: "Stripe returned invalid JSON" };
  }
  if (!session?.id) return { status: "FAIL", reason: "Stripe returned no session id" };

  const expire = await http(
    `${base}/v1/checkout/sessions/${encodeURIComponent(session.id)}/expire`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
    },
  );
  if (!expire.ok) return statusFailure(expire, "Stripe expire");
  await bodyText(expire);
  return ok("PASS", `created and expired ${session.id} (HTTP ${expire.status})`);
}

async function probeBlob(env, http, blobApiBase) {
  const base = trimBase(blobApiBase || "https://blob.vercel-storage.com");
  const key = `verifier/${randomUUID()}.txt`;
  const payload = "haunted-portrait-verifier";
  const put = await http(`${base}/${key}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}`,
      "x-api-version": "7",
      "x-content-type": "text/plain",
      "x-add-random-suffix": "0",
      "x-vercel-blob-access": "private",
    },
    body: payload,
  });
  if (!put.ok) return statusFailure(put, "Blob put");
  await bodyText(put);

  const get = await http(`${base}/${key}`, {
    headers: {
      authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}`,
      "x-api-version": "7",
    },
  });
  if (!get.ok) return statusFailure(get, "Blob get");
  const bytes = Buffer.from(await get.arrayBuffer());
  if (bytes.toString("utf8") !== payload) {
    return { status: "FAIL", reason: "Blob get returned different bytes" };
  }

  const remove = await http(`${base}/delete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}`,
      "x-api-version": "7",
      "content-type": "application/json",
    },
    body: JSON.stringify({ urls: [`${base}/${key}`] }),
  });
  if (!remove.ok) return statusFailure(remove, "Blob delete");
  await bodyText(remove);
  return ok("PASS", `wrote, read and deleted HTTP ${put.status}/${get.status}/${remove.status}`);
}

async function upstashCommand(env, http, args) {
  return http(env.KV_REST_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.KV_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
}

async function probeUpstash(env, http) {
  const key = `verifier:${randomUUID()}`;
  const value = "haunted-portrait-verifier";
  const set = await upstashCommand(env, http, ["SET", key, value, "EX", "60"]);
  if (!set.ok) return statusFailure(set, "Upstash SET");
  await bodyText(set);

  const get = await upstashCommand(env, http, ["GET", key]);
  if (!get.ok) return statusFailure(get, "Upstash GET");
  let payload;
  try {
    payload = await get.json();
  } catch {
    return { status: "FAIL", reason: "Upstash returned invalid JSON" };
  }
  if (payload?.result !== value) {
    return { status: "FAIL", reason: "Upstash GET returned a different value" };
  }

  const remove = await upstashCommand(env, http, ["DEL", key]);
  if (!remove.ok) return statusFailure(remove, "Upstash DEL");
  await bodyText(remove);
  return ok("PASS", `set, read and deleted HTTP ${set.status}/${get.status}/${remove.status}`);
}

async function probeTurnstile(env, http) {
  const response = await http(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: "verifier-dummy-token",
      }).toString(),
    },
  );
  if (!response.ok) return statusFailure(response, "Turnstile");
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: "FAIL", reason: "Turnstile returned invalid JSON" };
  }
  if (typeof payload?.success !== "boolean") {
    return { status: "FAIL", reason: "Turnstile returned no success flag" };
  }
  const errorCodes = Array.isArray(payload["error-codes"])
    ? payload["error-codes"].map(String)
    : [];
  if (errorCodes.includes("invalid-input-secret")) {
    return { status: "FAIL", reason: "Turnstile rejected the configured secret" };
  }
  return ok("PASS", `siteverify reachable (dummy token rejected: ${!payload.success})`);
}

function dryShape(env, service) {
  const required = {
    Gemini: ["GEMINI_API_KEY"],
    Stripe: ["STRIPE_SECRET_KEY", "STRIPE_PRICE_SINGLE_ID"],
    Blob: ["BLOB_READ_WRITE_TOKEN"],
    Upstash: ["KV_REST_URL", "KV_REST_TOKEN"],
    Turnstile: ["TURNSTILE_SECRET_KEY"],
  }[service];
  const missing = required.filter((name) => {
    if (service === "Stripe" && name === "STRIPE_PRICE_SINGLE_ID") {
      return !stripePriceId(env);
    }
    return !env[name];
  });
  return missing.length === 0
    ? { ok: true, reason: "dry run: shape valid" }
    : { ok: false, reason: `dry run: missing ${missing.join(", ")}` };
}

const SERVICES = [
  {
    name: "Gemini",
    configured: (env) => Boolean(env.GEMINI_API_KEY),
    probe: probeGemini,
  },
  {
    name: "Stripe",
    configured: (env) => Boolean(env.STRIPE_SECRET_KEY),
    probe: probeStripe,
  },
  {
    name: "Blob",
    configured: (env) => Boolean(env.BLOB_READ_WRITE_TOKEN),
    probe: probeBlob,
  },
  {
    name: "Upstash",
    configured: (env) => Boolean(env.KV_REST_URL || env.KV_REST_TOKEN),
    probe: probeUpstash,
  },
  {
    name: "Turnstile",
    configured: (env) => Boolean(env.TURNSTILE_SECRET_KEY),
    probe: probeTurnstile,
  },
];

/**
 * Runs the table without touching the CLI. `http` must look like fetch.
 * Returns redacted lines so callers can print or assert without leaking.
 */
export async function runVerifier({
  env = process.env,
  http = globalThis.fetch,
  argv = [],
  blobApiBase,
} = {}) {
  const dryRun = argv.includes("--dry-run");
  const results = [];

  for (const service of SERVICES) {
    if (!service.configured(env)) {
      results.push({ service: service.name, status: "SKIP", reason: "not configured" });
      continue;
    }
    try {
      const outcome = dryRun
        ? dryShape(env, service.name)
        : await service.probe(env, http, blobApiBase);
      const status =
        outcome.status ?? (outcome.ok === false ? "FAIL" : "PASS");
      results.push({
        service: service.name,
        status,
        reason: redact(outcome.reason, env),
      });
    } catch (error) {
      results.push({
        service: service.name,
        status: "FAIL",
        reason: redact(firstLine(error?.message ?? error), env),
      });
    }
  }

  const lines = results.map(
    (result) =>
      `${result.service.padEnd(10)} ${result.status.padEnd(4)} ${result.reason}`,
  );
  const failed = results.some((result) => result.status === "FAIL");
  return { results, lines, exitCode: failed ? 1 : 0 };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { lines, exitCode } = await runVerifier({
    argv: process.argv.slice(2),
  });
  for (const line of lines) console.log(redact(line));
  process.exitCode = exitCode;
}
