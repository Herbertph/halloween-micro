import { expect, test } from "@playwright/test";

import { generatePreview, openMockCheckout } from "./helpers";

test("G3-AC-3: demo mode labels the header, paywall and success page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("demo-badge").first()).toBeVisible();

  await generatePreview(page);
  await expect(
    page.getByTestId("paywall").getByTestId("demo-badge"),
  ).toBeVisible();

  await openMockCheckout(page);
  await expect(page.getByText("Test mode")).toBeVisible();

  await page.goto("/success?session_id=cs_forged");
  await expect(page.getByTestId("demo-badge").first()).toBeVisible();
});

test("G3-AC-14: the single purchase journey still works end to end", async ({
  page,
}) => {
  await generatePreview(page);
  await openMockCheckout(page);
  await page.getByRole("button", { name: /pay \$4\.99/i }).click();
  await page.waitForURL(/\/success\?session_id=/);
  await expect(
    page.getByRole("heading", { name: /your portrait is ready/i }),
  ).toBeVisible({ timeout: 10_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /download hd portrait/i }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).length).toBeGreaterThan(1_000);
});
