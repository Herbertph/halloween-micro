import { dataDir, storageDriver } from "@/lib/env";
import path from "node:path";

import { LocalStorage } from "./local";
import type { Storage } from "./types";
import { VercelBlobStorage } from "./vercel-blob";

export type { Storage } from "./types";

export function getStorage(): Storage {
  const driver = storageDriver();
  if (driver === "vercel-blob") {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required for STORAGE_DRIVER=vercel-blob");
    }
    return new VercelBlobStorage(token);
  }
  if (driver !== "local") {
    throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  }
  return new LocalStorage(path.resolve(dataDir(), "storage"));
}
