import { chromium, expect, test } from "@playwright/test";
import { launch } from "chrome-launcher";

/**
 * AC-24. Lighthouse is heavy, so this runs only when explicitly requested:
 *   RUN_LIGHTHOUSE=1 npm run e2e -- e2e/lighthouse.spec.ts
 * The app must be built (`npm run build`) — the Playwright web server serves it.
 */
test("AC-24: / meets the mobile performance and accessibility budget", async () => {
  test.skip(
    process.env.RUN_LIGHTHOUSE !== "1",
    "Set RUN_LIGHTHOUSE=1 to run the Lighthouse budget check",
  );
  test.setTimeout(180_000);

  const port = Number(process.env.E2E_PORT ?? 3101);
  const url = `http://127.0.0.1:${port}/`;
  const chromePath = process.env.CHROME_PATH || chromium.executablePath();
  const chrome = await launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  try {
    const lighthouse = (await import("lighthouse")).default;
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
    });
    if (!result) throw new Error("Lighthouse returned no result");
    const lhr = result.lhr;
    const performance = (lhr.categories.performance?.score ?? 0) * 100;
    const accessibility = (lhr.categories.accessibility?.score ?? 0) * 100;
    expect(performance, `performance score ${performance}`).toBeGreaterThanOrEqual(85);
    expect(accessibility, `accessibility score ${accessibility}`).toBeGreaterThanOrEqual(90);
  } finally {
    await chrome.kill();
  }
});
