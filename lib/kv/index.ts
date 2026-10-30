import { dataDir, kvDriver } from "@/lib/env";
import path from "node:path";

import { LocalKV } from "./local";
import type { KV } from "./types";
import { UpstashKV } from "./upstash";

export type { KV } from "./types";

let cached: { signature: string; kv: KV } | null = null;

/**
 * The driver instance is cached per configuration so the local driver can
 * serialise its atomic operations with in-process locks. Tests that point
 * `DATA_DIR` at a fresh directory get a fresh instance.
 */
export function getKv(): KV {
  const driver = kvDriver();

  if (driver === "upstash") {
    const url = process.env.KV_REST_URL ?? "";
    const token = process.env.KV_REST_TOKEN ?? "";
    if (!url || !token) {
      throw new Error("KV_REST_URL and KV_REST_TOKEN are required for KV_DRIVER=upstash");
    }
    const signature = `upstash:${url}`;
    if (cached?.signature === signature) return cached.kv;
    cached = { signature, kv: new UpstashKV(url, token) };
    return cached.kv;
  }

  if (driver !== "local") {
    throw new Error(`Unknown KV_DRIVER: ${driver}`);
  }

  const root = path.resolve(dataDir(), "kv");
  const signature = `local:${root}`;
  if (cached?.signature === signature) return cached.kv;
  cached = { signature, kv: new LocalKV(root) };
  return cached.kv;
}
