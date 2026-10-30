import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

async function exists(dir: string): Promise<boolean> {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else files.push(full);
  }
  return files;
}

const hasBuild = await exists(STATIC_DIR);

async function findLeaks(extraSecrets: string[]): Promise<string[]> {
  const files = await walk(STATIC_DIR);
  expect(files.length).toBeGreaterThan(0);

  const needleValues = [
    process.env.DOWNLOAD_SIGNING_SECRET,
    process.env.MOCK_WEBHOOK_SECRET,
    process.env.GEMINI_API_KEY,
    process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.CRON_SECRET,
    process.env.TURNSTILE_SECRET_KEY,
    process.env.ADMIN_PASSWORD,
    ...extraSecrets,
  ].filter(
    (value): value is string => typeof value === "string" && value.length >= 8,
  );

  const promptFragments = [
    "Reimagine the person or animal in the photo",
    "family-friendly",
    "Keep the subject's identity, pose and framing",
  ];

  const leaks: string[] = [];
  for (const file of files) {
    if (!/\.(js|css|json|html|txt)$/.test(file)) continue;
    const content = await readFile(file, "utf8");
    for (const value of needleValues) {
      if (content.includes(value)) leaks.push(`${file}: secret value`);
    }
    for (const fragment of promptFragments) {
      if (content.includes(fragment)) leaks.push(`${file}: prompt text`);
    }
  }
  return leaks;
}

describe("client bundle", () => {
  it.skipIf(!hasBuild)(
    "AC-27: no server secret or prompt text is in .next/static",
    async () => {
      expect(await findLeaks([])).toEqual([]);
    },
  );

  it.skipIf(!hasBuild)(
    "AC-29: Turnstile secret, admin password, download/share secrets and prompts stay server-side",
    async () => {
      expect(
        await findLeaks([
          "turnstile-test-secret-should-never-ship",
          "admin-password-should-never-ship",
        ]),
      ).toEqual([]);
    },
  );

  it("AC-29: the check:secrets script scans the increment 2 secrets", async () => {
    const script = await readFile(
      path.join(process.cwd(), "scripts", "check-secrets.mjs"),
      "utf8",
    );
    expect(script).toContain("DOWNLOAD_SIGNING_SECRET");
    expect(script).toContain("TURNSTILE_SECRET_KEY");
    expect(script).toContain("ADMIN_PASSWORD");
  });
});
