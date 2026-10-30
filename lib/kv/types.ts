export interface SetOptions {
  /** Expiry in seconds. */
  exSeconds?: number;
}

export interface RollingWindowInput {
  key: string;
  /** Unique id for this attempt. */
  member: string;
  score: number;
  windowMs: number;
  limit: number;
  ttlSeconds: number;
}

export interface RollingWindowResult {
  allowed: boolean;
  /** Entries still inside the window after the attempt was accepted or rolled back. */
  count: number;
  /** Score of the oldest entry still inside the window. */
  oldest: number;
}

export type KVErrorCode = "http" | "timeout" | "network";

/** Typed KV failure so callers can surface retryable errors. */
export class KVError extends Error {
  constructor(
    public readonly code: KVErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "KVError";
  }
}

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Increments a counter atomically and applies the TTL on first write. */
  incr(key: string, exSeconds?: number): Promise<number>;
  /** Atomically adds `amount` to a counter (used for revenue cents). */
  incrBy(key: string, amount: number, exSeconds?: number): Promise<number>;
  /** Atomic set add; safe for concurrent writers. */
  setAdd(key: string, member: string): Promise<void>;
  /** Atomic set add that reports whether this caller inserted the member. */
  setAddIfAbsent(key: string, member: string): Promise<boolean>;
  setRemove(key: string, member: string): Promise<void>;
  setMembers(key: string): Promise<string[]>;
  /** SET NX EX: true when the value was stored (lock acquired / ID reserved). */
  setIfAbsent(key: string, value: string, exSeconds?: number): Promise<boolean>;
  /** Deletes the key only if it still holds this value (lock release). */
  deleteIfValue(key: string, value: string): Promise<void>;
  /**
   * Atomically adds one timestamp to a rolling window and reports whether the
   * attempt fits inside `limit`. A rejected attempt is rolled back, so it never
   * consumes budget. This is one operation on purpose: read-modify-write from
   * the caller would let parallel requests bypass the limit.
   */
  addToRollingWindow(input: RollingWindowInput): Promise<RollingWindowResult>;
}
