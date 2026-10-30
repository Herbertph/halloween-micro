import "server-only";

export const DOWNLOAD_TOKEN_TTL_SECONDS = 15 * 60;

const DEV_DOWNLOAD_SECRET = "dev-download-signing-secret-change-me";
const DEV_WEBHOOK_SECRET = "dev-mock-webhook-secret-change-me";
const DEV_CRON_SECRET = "dev-cron-secret-change-me";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function requiredInProduction(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction()) {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function siteHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "localhost:3000";
  }
}

export function contactEmail(): string {
  return process.env.CONTACT_EMAIL || "hello@hauntedportrait.example";
}

export function plausibleDomain(): string | undefined {
  return process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || undefined;
}

export function priceCents(): number {
  return numberFromEnv("PRICE_SINGLE_CENTS", 499);
}

export function imageProviderName(): string {
  return (process.env.IMAGE_PROVIDER || "mock").toLowerCase();
}

export function paymentProviderName(): string {
  return (process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
}

export function generationTimeoutMs(): number {
  return numberFromEnv("GENERATION_TIMEOUT_MS", 60_000);
}

export function previewLimitPerIp(): number {
  return numberFromEnv("PREVIEW_LIMIT_PER_IP", 3);
}

export function dailyGenerationCap(): number {
  return numberFromEnv("DAILY_GENERATION_CAP", 2000);
}

export function retentionHours(): number {
  return numberFromEnv("RETENTION_HOURS", 48);
}

export function storageDriver(): string {
  return (process.env.STORAGE_DRIVER || "local").toLowerCase();
}

export function kvDriver(): string {
  return (process.env.KV_DRIVER || "local").toLowerCase();
}

export function dataDir(): string {
  return process.env.DATA_DIR || ".data";
}

export function downloadSecret(): string {
  return requiredInProduction("DOWNLOAD_SIGNING_SECRET", DEV_DOWNLOAD_SECRET);
}

export function mockWebhookSecret(): string {
  return requiredInProduction("MOCK_WEBHOOK_SECRET", DEV_WEBHOOK_SECRET);
}

export function cronSecret(): string | undefined {
  const value = process.env.CRON_SECRET;
  if (value) return value;
  return isProduction() ? undefined : DEV_CRON_SECRET;
}
