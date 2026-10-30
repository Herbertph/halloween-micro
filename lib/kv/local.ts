import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  KV,
  RollingWindowInput,
  RollingWindowResult,
  SetOptions,
} from "./types";

interface Entry {
  value: string;
  expiresAt: number | null;
}

interface WindowEntry {
  member: string;
  score: number;
}

interface WindowFile {
  expiresAt: number | null;
  entries: WindowEntry[];
}

/**
 * Disk-backed KV for development and tests. It is single-process only, so the
 * atomic operations are serialised with an in-process per-key lock. Production
 * uses Upstash, where the same operations are atomic in Redis (Lua script).
 */
export class LocalKV implements KV {
  private readonly root: string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(root: string) {
    this.root = root;
  }

  private file(key: string): string {
    return path.join(this.root, `${encodeURIComponent(key)}.json`);
  }

  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(key, settled);
    void settled.finally(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    return run;
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

  private setDir(key: string): string {
    return path.join(this.root, "sets", encodeURIComponent(key));
  }

  private windowFile(key: string): string {
    return path.join(this.root, "windows", `${encodeURIComponent(key)}.json`);
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
    return this.withLock(key, async () => {
      const entry = await this.readEntry(key);
      const next = (entry ? Number(entry.value) : 0) + 1;
      const expiresAt = entry
        ? entry.expiresAt
        : exSeconds
          ? Date.now() + exSeconds * 1000
          : null;
      await this.writeEntry(key, { value: String(next), expiresAt });
      return next;
    });
  }

  async setAdd(key: string, member: string): Promise<void> {
    const dir = this.setDir(key);
    await mkdir(dir, { recursive: true });
    try {
      // `wx` makes the add idempotent and atomic for concurrent writers.
      await writeFile(path.join(dir, encodeURIComponent(member)), "", {
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  async setRemove(key: string, member: string): Promise<void> {
    await rm(path.join(this.setDir(key), encodeURIComponent(member)), {
      force: true,
    });
  }

  async setMembers(key: string): Promise<string[]> {
    try {
      const entries = await readdir(this.setDir(key), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => decodeURIComponent(entry.name));
    } catch {
      return [];
    }
  }

  async addToRollingWindow(
    input: RollingWindowInput,
  ): Promise<RollingWindowResult> {
    return this.withLock(`window:${input.key}`, async () => {
      const file = this.windowFile(input.key);
      let window: WindowFile = { expiresAt: null, entries: [] };
      try {
        const parsed = JSON.parse(await readFile(file, "utf8")) as WindowFile;
        if (parsed.expiresAt === null || parsed.expiresAt > Date.now()) {
          window = parsed;
        }
      } catch {
        // Missing or corrupt window: start a fresh one.
      }

      const cutoff = input.score - input.windowMs;
      const entries = window.entries.filter(
        (entry) => entry.score > cutoff && entry.member !== input.member,
      );
      entries.push({ member: input.member, score: input.score });
      entries.sort((left, right) => left.score - right.score);

      let allowed = true;
      if (entries.length > input.limit) {
        const index = entries.findIndex((entry) => entry.member === input.member);
        if (index >= 0) entries.splice(index, 1);
        allowed = false;
      }

      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(
        file,
        JSON.stringify({
          expiresAt: Date.now() + input.ttlSeconds * 1000,
          entries,
        }),
        "utf8",
      );

      return {
        allowed,
        count: entries.length,
        oldest: entries[0]?.score ?? input.score,
      };
    });
  }
}
