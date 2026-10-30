import { expect, test } from "@playwright/test";

import { generatePreview } from "./helpers";

test("AC-1: landing and paywall show both products and prices", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("$4.99").first()).toBeVisible();
  await expect(page.getByText("$8.99").first()).toBeVisible();
  await expect(page.getByText(/4 styles, one download each/i).first()).toBeVisible();

  await generatePreview(page);
  await expect(
    page.getByRole("button", { name: /unlock hd — \$4\.99/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /monster pack — \$8\.99/i }),
  ).toBeVisible();
  await expect(page.getByText(/4 styles, one download each/i).first()).toBeVisible();
});

test("AC-27: a pack purchase delivers four cards and a download", async ({ page }) => {
  await generatePreview(page, { style: "Witch" });

  await page.getByRole("button", { name: /monster pack — \$8\.99/i }).click();
  await page.waitForURL(/\/checkout\/mock\?session=/);
  await expect(page.getByText("Test mode")).toBeVisible();
  await expect(page.getByText(/Monster Pack — 4 styles/i)).toBeVisible();
  await expect(page.getByText("$8.99").first()).toBeVisible();

  await page.getByRole("button", { name: /pay \$8\.99/i }).click();
  await page.waitForURL(/\/success\?session_id=/);
  await expect(
    page.getByRole("heading", { name: /your monster pack is ready/i }),
  ).toBeVisible({ timeout: 15_000 });

  const downloads = page.locator('a[href^="/api/download"]');
  await expect(downloads).toHaveCount(4, { timeout: 60_000 });

  const downloadPromise = page.waitForEvent("download");
  await downloads.first().click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).length).toBeGreaterThan(1_000);

  await expect(page.getByText(/Your images are deleted after 48 hours/i)).toBeVisible();
});
