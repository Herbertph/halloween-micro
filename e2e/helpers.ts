import { expect, type Page } from "@playwright/test";
import path from "node:path";

export function fixture(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

export async function generatePreview(
  page: Page,
  options: { photo?: string; style?: string } = {},
): Promise<void> {
  await page.goto("/create");
  await page.setInputFiles("#photo", fixture(options.photo ?? "valid.jpg"));
  if (options.style) {
    await page.getByRole("radio", { name: new RegExp(options.style, "i") }).check();
  }
  await page.getByLabel(/I own this photo/i).check();
  await page.getByRole("button", { name: /generate free preview/i }).click();
  await expect(
    page.getByRole("button", { name: /unlock hd/i }),
  ).toBeVisible({ timeout: 60_000 });
}

export async function openMockCheckout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /unlock hd/i }).click();
  await page.waitForURL(/\/checkout\/mock\?session=/);
  await expect(page.getByText("Test mode")).toBeVisible();
}
