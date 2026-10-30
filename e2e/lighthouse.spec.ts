import { chromium, expect, test } from "@playwright/test";
import { launch } from "chrome-launcher";

const RUNS = 3;

interface Scores {
  performance: number;
  accessibility: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Lighthouse is noisy on shared CI machines, so each budget check is the median
 * of three runs (standard practice for Core Web Vitals budgets).
 */
async function lighthouseScores(url: string): Promise<Scores> {
  const chromePath = process.env.CHROME_PATH || chromium.executablePath();
  const chrome = await launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });
  try {
    const lighthouse = (await import("lighthouse")).default;
    const performance: number[] = [];
    const accessibility: number[] = [];
    // Warm the server so the first run is not measured cold.
    await fetch(url).catch(() => undefined);
    for (let run = 0; run < RUNS; run += 1) {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
      });
      if (!result) throw new Error("Lighthouse returned no result");
      performance.push((result.lhr.categories.performance?.score ?? 0) * 100);
      accessibility.push((result.lhr.categories.accessibility?.score ?? 0) * 100);
    }
    return {
      performance: median(performance),
      accessibility: median(accessibility),
    };
  } finally {
    await chrome.kill();
  }
}

test("AC-24: / meets the mobile performance and accessibility budget", async () => {
  test.skip(
    process.env.RUN_LIGHTHOUSE !== "1",
    "Set RUN_LIGHTHOUSE=1 to run the Lighthouse budget check",
  );
  test.setTimeout(300_000);

  const port = Number(process.env.E2E_PORT ?? 3101);
  const scores = await lighthouseScores(`http://127.0.0.1:${port}/`);
  expect(scores.performance, `performance score ${scores.performance}`).toBeGreaterThanOrEqual(85);
  expect(scores.accessibility, `accessibility score ${scores.accessibility}`).toBeGreaterThanOrEqual(90);
});

test("AC-28: /create meets the mobile performance and accessibility budget", async () => {
  test.skip(
    process.env.RUN_LIGHTHOUSE !== "1",
    "Set RUN_LIGHTHOUSE=1 to run the Lighthouse budget check",
  );
  test.setTimeout(300_000);

  const port = Number(process.env.E2E_PORT ?? 3101);
  const scores = await lighthouseScores(`http://127.0.0.1:${port}/create`);
  expect(scores.performance, `performance score ${scores.performance}`).toBeGreaterThanOrEqual(85);
  expect(scores.accessibility, `accessibility score ${scores.accessibility}`).toBeGreaterThanOrEqual(90);
});
