import { expect, test } from "@playwright/test";

import { generatePreview, openMockCheckout } from "./helpers";

test("AC-26: the full upload → preview → pay → unlock → download flow works", async ({
  page,
}) => {
  await generatePreview(page, { style: "Witch" });

  // AC-6: the page offers the watermark preview and no full-resolution URL.
  const preview = page.getByAltText(/watermarked preview of your haunted portrait/i);
  await expect(preview).toBeVisible();
  const contentBeforePay = await page.content();
  expect(contentBeforePay).not.toContain("/api/download");
  expect(contentBeforePay).not.toContain("blobs/");

  // AC-10: hosted mock checkout with amount and Test mode.
  await openMockCheckout(page);
  await expect(page.getByText("$4.99").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /pay \$4\.99/i }),
  ).toBeVisible();

  // AC-11: Pay → signed webhook → success page unlocks within 10 s.
  await page.getByRole("button", { name: /pay \$4\.99/i }).click();
  await page.waitForURL(/\/success\?session_id=/);
  await expect(
    page.getByRole("heading", { name: /your portrait is ready/i }),
  ).toBeVisible({ timeout: 10_000 });

  // FR-28: expiry notice with the exact deletion time.
  await expect(
    page.getByText("Your images are deleted after 48 hours. Download them now."),
  ).toBeVisible();
  await expect(page.getByText(/Deletion time:/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /download hd portrait/i }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(1_000);
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
});

test("AC-12: declining the mock checkout returns to the paywall with a retryable error", async ({
  page,
}) => {
  await generatePreview(page);
  await openMockCheckout(page);

  await page.getByRole("button", { name: /decline payment/i }).click();
  await page.waitForURL(/\/create\?job=.*declined=1/);

  await expect(page.getByText(/Payment was declined/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /unlock hd/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /download hd portrait/i }),
  ).toHaveCount(0);
  expect(await page.content()).not.toContain("/api/download");
});

test("AC-13: the success page never unlocks from a forged or missing session", async ({
  page,
}) => {
  await page.goto("/success?session_id=cs_forged");
  await expect(
    page.getByRole("heading", { name: /couldn't find that order/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /download hd portrait/i }),
  ).toHaveCount(0);
  expect(await page.content()).not.toContain("/api/download");
  expect(await page.content()).not.toContain("blobs/");

  await page.goto("/success");
  await expect(
    page.getByRole("heading", { name: /couldn't find that order/i }),
  ).toBeVisible();
});

test("AC-9: a featureless photo shows a friendly failure with a free retry", async ({
  page,
}) => {
  await page.goto("/create");
  await page.setInputFiles("#photo", "tests/fixtures/blank.jpg");
  await page.getByLabel(/I own this photo/i).check();
  await page.getByRole("button", { name: /generate free preview/i }).click();

  await expect(page.getByText(/couldn't find a face or pet/i)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /unlock hd/i }),
  ).toHaveCount(0);
});

test("AC-1: the landing page has every promised section and is keyboard navigable", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /your photo, delightfully haunted/i }),
  ).toBeVisible();
  const cta = page.getByRole("link", { name: /haunt my photo/i }).first();
  await expect(cta).toHaveAttribute("href", "/create");
  await expect(page.getByText("$4.99").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /how it works/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /questions/i })).toBeVisible();
  await expect(
    page.getByText(/Not happy with your portrait\? Email us within 7 days/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /hello@hauntedportrait\.example/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^privacy$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^terms$/i })).toBeVisible();

  // Keyboard: tab until the primary CTA receives focus.
  let focused = false;
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press("Tab");
    const text = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (/haunt my photo/i.test(text)) {
      focused = true;
      break;
    }
  }
  expect(focused).toBe(true);

  // The FAQ answers are reachable with the keyboard.
  const firstSummary = page.locator("summary").first();
  await firstSummary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Your upload is processed/i)).toBeVisible();
});

test("AC-2: the Halloween banner follows the server date in UTC", async ({ page }) => {
  await page.goto("/");
  const now = new Date();
  const isOct31 = now.getUTCMonth() === 9 && now.getUTCDate() === 31;
  const isOct30 = now.getUTCMonth() === 9 && now.getUTCDate() === 30;

  const banner = page.locator('[role="status"]');
  if (isOct31) {
    await expect(banner).toContainText(/Halloween is today/i);
  } else if (isOct30) {
    await expect(banner).toContainText(/Halloween is tomorrow/i);
  } else {
    await expect(banner).toHaveCount(0);
  }
});

test("AC-23: privacy and terms disclose retention, the AI provider, contact and refunds", async ({
  page,
}) => {
  for (const route of ["/privacy", "/terms"]) {
    await page.goto(route);
    const body = page.locator("main");
    await expect(body).toContainText(/48 hours/i);
    await expect(body).toContainText(/Gemini|AI image provider/i);
    await expect(body).toContainText(/hello@hauntedportrait\.example/i);
    await expect(body).toContainText(/7 days/i);
  }
});
