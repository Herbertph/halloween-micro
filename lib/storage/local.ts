import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Storage } from "./types";

function safeSegments(key: string): string[] {
  const segments = key.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === ".." || segment === ".")
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return segments;
}

export class LocalStorage implements Storage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private file(key: string): string {
    return path.join(this.root, ...safeSegments(key));
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }
}
