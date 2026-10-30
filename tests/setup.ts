import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});

process.env.IMAGE_PROVIDER = "mock";
process.env.PAYMENT_PROVIDER = "mock";
process.env.STORAGE_DRIVER = "local";
process.env.KV_DRIVER = "local";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.DOWNLOAD_SIGNING_SECRET = "test-download-secret";
process.env.MOCK_WEBHOOK_SECRET = "test-webhook-secret";
process.env.CRON_SECRET = "test-cron-secret";
process.env.PRICE_SINGLE_CENTS = "499";
process.env.RETENTION_HOURS = "48";
process.env.PREVIEW_LIMIT_PER_IP = "3";
process.env.DAILY_GENERATION_CAP = "2000";
process.env.GENERATION_TIMEOUT_MS = "60000";
process.env.PRICE_PACK_CENTS = "899";
process.env.GENERATION_COST_CENTS = "4";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.TURNSTILE_SITE_KEY = "";
process.env.TURNSTILE_SECRET_KEY = "";
process.env.TURNSTILE_ENFORCED = "false";
process.env.ALLOW_MOCK_PROVIDERS = "false";
process.env.STRIPE_PRICE_SINGLE_ID = "price_test_single";
process.env.STRIPE_PRICE_PACK_ID = "price_test_pack";
