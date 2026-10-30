import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { KV, SetOptions } from "./types";

interface Entry {
  value: string;
  expiresAt: number | null;
}

export class LocalKV implements KV {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private file(key: string): string {
    return path.join(this.root, `${encodeURIComponent(key)}.json`);
  }

  private async readEntry(key: string): Promise<Entry | null> {
    try {
      const entry = JSON.parse(await readFile(this.file(key), "utf8")) as Entry;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        await rm(this.file(key), { force: true });
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  private async writeEntry(key: string, entry: Entry): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.file(key), JSON.stringify(entry), "utf8");
  }

  async get(key: string): Promise<string | null> {
    const entry = await this.readEntry(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string, options?: SetOptions): Promise<void> {
    await this.writeEntry(key, {
      value,
      expiresAt: options?.exSeconds
        ? Date.now() + options.exSeconds * 1000
        : null,
    });
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }

  async incr(key: string, exSeconds?: number): Promise<number> {
    const entry = await this.readEntry(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    const expiresAt = entry
      ? entry.expiresAt
      : exSeconds
        ? Date.now() + exSeconds * 1000
        : null;
    await this.writeEntry(key, { value: String(next), expiresAt });
    return next;
  }
}
