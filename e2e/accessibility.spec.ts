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

test("AC-25: keyboard focus is visible on the upload control", async ({ page }) => {
  await page.goto("/create");
  const label = page.locator('label[for="photo"]');
  const idleBorder = await label.evaluate((element) => getComputedStyle(element).borderColor);
  const idleOutline = await label.evaluate((element) => getComputedStyle(element).outlineStyle);

  await page.focus("#photo");

  const focused = await page.evaluate(() => {
    const input = document.querySelector("#photo") as HTMLElement;
    const wrapper = input.closest("label") as HTMLElement;
    const rect = input.getBoundingClientRect();
    const wrapperStyle = getComputedStyle(wrapper);
    return {
      isActive: document.activeElement === input,
      width: rect.width,
      height: rect.height,
      wrapperBorder: wrapperStyle.borderColor,
      wrapperOutline: wrapperStyle.outlineStyle,
    };
  });

  expect(focused.isActive).toBe(true);
  // The real input is clipped to 1x1 px, so a focus ring on the input itself is
  // invisible. The wrapping label must show the focus state instead.
  const inputIsVisible = focused.width >= 8 && focused.height >= 8;
  const labelChanged =
    focused.wrapperBorder !== idleBorder || focused.wrapperOutline !== idleOutline;
  expect(
    inputIsVisible || labelChanged,
    `no visible focus indicator on the upload control: ${JSON.stringify(focused)}`,
  ).toBe(true);
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
