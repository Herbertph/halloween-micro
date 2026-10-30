import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("AC-25: / and /create have no critical axe violations", async ({ page }) => {
  for (const route of ["/", "/create"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(
      (violation) => violation.impact === "critical",
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  }
});

test("AC-25: upload controls expose labels and images have alt text", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(page.locator("#photo")).toHaveCount(1);
  await expect(page.getByLabel(/I own this photo/i)).toBeVisible();
  await page.getByRole("radio", { name: /pumpkin/i }).check();

  await page.goto("/");
  const images = page.locator("img");
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const alt = await images.nth(index).getAttribute("alt");
    expect(alt?.trim().length ?? 0).toBeGreaterThan(0);
  }
});
