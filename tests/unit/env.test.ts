import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_DIRS = ["app", "lib", "components", "config"];

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function envNamesIn(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/process\.env\[["']([A-Z0-9_]+)["']\]/g)) {
    names.add(match[1]);
  }
  return [...names];
}

async function missingEnvNames(): Promise<string[]> {
  const files = (await Promise.all(SOURCE_DIRS.map((dir) => walk(dir)))).flat();
  expect(files.length).toBeGreaterThan(10);

  const used = new Set<string>();
  for (const file of files) {
    for (const name of envNamesIn(await readFile(file, "utf8"))) {
      if (name !== "NODE_ENV") used.add(name);
    }
  }

  const example = await readFile(path.join(process.cwd(), ".env.example"), "utf8");
  const documented = new Set(
    [...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]),
  );

  return [...used].filter((name) => !documented.has(name)).sort();
}

describe("configuration coverage", () => {
  it("AC-28: every process.env name read by the code is documented in .env.example", async () => {
    expect(await missingEnvNames()).toEqual([]);
  });

  it("AC-30: the increment 2 env vars are documented too", async () => {
    const missing = await missingEnvNames();
    expect(missing).toEqual([]);
    const example = await readFile(path.join(process.cwd(), ".env.example"), "utf8");
    for (const name of [
      "PRICE_PACK_CENTS",
      "TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "TURNSTILE_ENFORCED",
      "ADMIN_PASSWORD",
      "GENERATION_COST_CENTS",
    ]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });

  it("G3-AC-15: every env name is documented and the hardening vars are present", async () => {
    expect(await missingEnvNames()).toEqual([]);
    const example = await readFile(path.join(process.cwd(), ".env.example"), "utf8");
    for (const name of [
      "ALLOW_MOCK_PROVIDERS",
      "STRIPE_PRICE_SINGLE_ID",
      "STRIPE_PRICE_PACK_ID",
    ]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});
