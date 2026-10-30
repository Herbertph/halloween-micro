import { dataDir, kvDriver } from "@/lib/env";
import path from "node:path";

import { LocalKV } from "./local";
import type { KV } from "./types";
import { UpstashKV } from "./upstash";

export type { KV } from "./types";

export function getKv(): KV {
  const driver = kvDriver();
  if (driver === "upstash") {
    const url = process.env.KV_REST_URL;
    const token = process.env.KV_REST_TOKEN;
    if (!url || !token) {
      throw new Error("KV_REST_URL and KV_REST_TOKEN are required for KV_DRIVER=upstash");
    }
    return new UpstashKV(url, token);
  }
  if (driver !== "local") {
    throw new Error(`Unknown KV_DRIVER: ${driver}`);
  }
  return new LocalKV(path.resolve(dataDir(), "kv"));
}
