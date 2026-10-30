import type {
  KV,
  RollingWindowInput,
  RollingWindowResult,
  SetOptions,
} from "./types";

const ROLLING_WINDOW_SCRIPT = `
local key = KEYS[1]
local member = ARGV[1]
local score = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

redis.call('ZADD', key, score, member)
redis.call('ZREMRANGEBYSCORE', key, '-inf', score - window)
local count = redis.call('ZCARD', key)
local allowed = 1
if count > limit then
  redis.call('ZREM', key, member)
  count = count - 1
  allowed = 0
end
redis.call('EXPIRE', key, ttl)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local oldestScore = score
if oldest[2] then oldestScore = tonumber(oldest[2]) end
return {allowed, count, oldestScore}
`;

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
    return this.incrBy(key, 1, exSeconds);
  }

  async incrBy(key: string, amount: number, exSeconds?: number): Promise<number> {
    const next = await this.command<number>("INCRBY", key, String(amount));
    if (exSeconds) {
      await this.command("EXPIRE", key, String(exSeconds));
    }
    return next;
  }

  async setAdd(key: string, member: string): Promise<void> {
    await this.command("SADD", key, member);
  }

  async setAddIfAbsent(key: string, member: string): Promise<boolean> {
    const added = await this.command<number>("SADD", key, member);
    return added === 1;
  }

  async setIfAbsent(
    key: string,
    value: string,
    exSeconds?: number,
  ): Promise<boolean> {
    const args = ["SET", key, value, "NX"];
    if (exSeconds) args.push("EX", String(exSeconds));
    const result = await this.command<string | null>(...args);
    return result === "OK";
  }

  async deleteIfValue(key: string, value: string): Promise<void> {
    await this.command(
      "EVAL",
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      "1",
      key,
      value,
    );
  }

  async setRemove(key: string, member: string): Promise<void> {
    await this.command("SREM", key, member);
  }

  async setMembers(key: string): Promise<string[]> {
    return (await this.command<string[] | null>("SMEMBERS", key)) ?? [];
  }

  async addToRollingWindow(
    input: RollingWindowInput,
  ): Promise<RollingWindowResult> {
    const result = await this.command<number[]>(
      "EVAL",
      ROLLING_WINDOW_SCRIPT,
      "1",
      input.key,
      input.member,
      String(input.score),
      String(input.windowMs),
      String(input.limit),
      String(input.ttlSeconds),
    );
    const [allowed, count, oldest] = result ?? [];
    return {
      allowed: Number(allowed) === 1,
      count: Number(count) || 0,
      oldest: Number(oldest) || input.score,
    };
  }
}
