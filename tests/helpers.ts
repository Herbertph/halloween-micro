import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Every test file gets its own disk-backed storage and KV directory. */
export async function useTempDataDir(): Promise<() => Promise<void>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "haunted-test-"));
  process.env.DATA_DIR = dir;
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}

export function resetLimitEnv() {
  process.env.PREVIEW_LIMIT_PER_IP = "3";
  process.env.DAILY_GENERATION_CAP = "2000";
  process.env.RETENTION_HOURS = "48";
  process.env.GENERATION_TIMEOUT_MS = "60000";
}
