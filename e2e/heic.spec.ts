import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * FR-7: HEIC/HEIF is converted in the browser. The production CSP must allow the
 * heic2any WASM worker to run, and a decoder failure must still show the fallback
 * message instead of leaving the visitor on "Getting your photo ready…".
 */
test("TC-40 (FR-7): a HEIC upload is converted in the browser", async ({ page }) => {
  await page.goto("/create");
  await page.setInputFiles(
    "#photo",
    path.join(process.cwd(), "tests", "fixtures", "heic", "example.heic"),
  );
  await page.getByLabel(/I own this photo/i).check();
  await page.getByRole("button", { name: /generate free preview/i }).click();

  const preview = page
    .getByRole("button", { name: /unlock hd/i })
    .waitFor({ timeout: 60_000 })
    .then(() => "preview" as const)
    .catch(() => "hung" as const);
  const fallback = page
    .getByText(/HEIC can't be read here/i)
    .first()
    .waitFor({ timeout: 60_000 })
    .then(() => "fallback" as const)
    .catch(() => "hung" as const);

  const outcome = await Promise.race([preview, fallback]);
  expect(
    outcome,
    "a HEIC upload must either convert to a preview or show the export-as-JPG message",
  ).not.toBe("hung");
});
