export type ConfigMode = "live" | "demo";

export interface ConfigSnapshot {
  [key: string]: string | undefined;
}

export interface ConfigStatus {
  ready: boolean;
  mode: ConfigMode;
  problems: string[];
  drivers: {
    image: string;
    payment: string;
    storage: string;
    kv: string;
  };
}

function value(env: ConfigSnapshot, name: string, fallback: string): string {
  return env[name] || fallback;
}

function missing(env: ConfigSnapshot, names: string[], problems: string[]): void {
  for (const name of names) {
    if (!env[name]) problems.push(`missing ${name}`);
  }
}

/**
 * Pure configuration check over an env snapshot. Production refuses mock
 * providers and local drivers unless the owner deliberately opts into a demo
 * deploy. The problems list contains variable/driver names only, never values.
 */
export function describeConfig(env: ConfigSnapshot): ConfigStatus {
  const production = env.NODE_ENV === "production";
  const allowMock = env.ALLOW_MOCK_PROVIDERS === "true";
  const payment = value(env, "PAYMENT_PROVIDER", "mock").toLowerCase();
  const image = value(env, "IMAGE_PROVIDER", "mock").toLowerCase();
  const storage = value(env, "STORAGE_DRIVER", "local").toLowerCase();
  const kv = value(env, "KV_DRIVER", "local").toLowerCase();
  const mode: ConfigMode = allowMock ? "demo" : "live";
  const problems: string[] = [];

  if (!production) {
    return {
      ready: true,
      mode,
      problems,
      drivers: { image, payment, storage, kv },
    };
  }

  if (!allowMock) {
    if (payment === "mock") {
      problems.push("PAYMENT_PROVIDER=mock is not allowed in production");
    }
    if (image === "mock") {
      problems.push("IMAGE_PROVIDER=mock is not allowed in production");
    }
    if (storage === "local") {
      problems.push("STORAGE_DRIVER=local is not allowed in production");
    }
    if (kv === "local") {
      problems.push("KV_DRIVER=local is not allowed in production");
    }
  }

  missing(env, ["DOWNLOAD_SIGNING_SECRET", "CRON_SECRET"], problems);
  if (payment === "stripe") {
    missing(env, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], problems);
  }
  if (image === "gemini") {
    missing(env, ["GEMINI_API_KEY"], problems);
  }
  if (storage === "vercel-blob") {
    missing(env, ["BLOB_READ_WRITE_TOKEN"], problems);
  }
  if (kv === "upstash") {
    missing(env, ["KV_REST_URL", "KV_REST_TOKEN"], problems);
  }
  if (allowMock && payment === "mock") {
    missing(env, ["MOCK_WEBHOOK_SECRET"], problems);
  }

  return {
    ready: problems.length === 0,
    mode,
    problems,
    drivers: { image, payment, storage, kv },
  };
}

export function getConfigStatus(): ConfigStatus {
  return describeConfig(process.env);
}

let logged = false;

/**
 * Routes call this before any provider or storage work. The refusal reason is
 * logged once per process (variable/driver names only, never values).
 */
export function assertProductionConfig(): ConfigStatus {
  const status = getConfigStatus();
  if (!status.ready && !logged) {
    logged = true;
    console.error(
      `[config] production configuration refused: ${status.problems.join("; ")}`,
    );
  }
  return status;
}

/** Called from instrumentation so a bad deploy is visible at start-up. */
export function logProductionConfigOnce(): void {
  assertProductionConfig();
}
