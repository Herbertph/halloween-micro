import type { KV, SetOptions } from "./types";

/**
 * Upstash Redis REST driver. Production only; no account is needed to develop
 * or test, so the disk driver covers every automated test.
 */
export class UpstashKV implements KV {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command<T = unknown>(...args: string[]): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Upstash command failed: ${response.status}`);
    }
    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.result as T;
  }

  async get(key: string): Promise<string | null> {
    return (await this.command<string | null>("GET", key)) ?? null;
  }

  async set(key: string, value: string, options?: SetOptions): Promise<void> {
    if (options?.exSeconds) {
      await this.command("SET", key, value, "EX", String(options.exSeconds));
    } else {
      await this.command("SET", key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.command("DEL", key);
  }

  async incr(key: string, exSeconds?: number): Promise<number> {
    const next = await this.command<number>("INCR", key);
    if (next === 1 && exSeconds) {
      await this.command("EXPIRE", key, String(exSeconds));
    }
    return next;
  }
}
