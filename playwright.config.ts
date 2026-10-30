import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3101);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      IMAGE_PROVIDER: "mock",
      PAYMENT_PROVIDER: "mock",
      STORAGE_DRIVER: "local",
      KV_DRIVER: "local",
      DATA_DIR: ".data/e2e",
      NEXT_PUBLIC_SITE_URL: baseURL,
      DOWNLOAD_SIGNING_SECRET: "e2e-download-secret",
      MOCK_WEBHOOK_SECRET: "e2e-webhook-secret",
      CRON_SECRET: "e2e-cron-secret",
      ADMIN_PASSWORD: "e2e-admin-password",
      PRICE_SINGLE_CENTS: "499",
      PRICE_PACK_CENTS: "899",
      GENERATION_COST_CENTS: "4",
      TURNSTILE_ENFORCED: "false",
      RETENTION_HOURS: "48",
      PREVIEW_LIMIT_PER_IP: "50",
      DAILY_GENERATION_CAP: "5000",
      CONTACT_EMAIL: "hello@hauntedportrait.example",
      // No Plausible in e2e: analytics must be a no-op.
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "",
    },
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "android",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
