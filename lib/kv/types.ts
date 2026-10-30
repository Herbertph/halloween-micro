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

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Increments a counter atomically and applies the TTL on first write. */
  incr(key: string, exSeconds?: number): Promise<number>;
  /** Atomic set add; safe for concurrent writers. */
  setAdd(key: string, member: string): Promise<void>;
  setRemove(key: string, member: string): Promise<void>;
  setMembers(key: string): Promise<string[]>;
  /**
   * Atomically adds one timestamp to a rolling window and reports whether the
   * attempt fits inside `limit`. A rejected attempt is rolled back, so it never
   * consumes budget. This is one operation on purpose: read-modify-write from
   * the caller would let parallel requests bypass the limit.
   */
  addToRollingWindow(input: RollingWindowInput): Promise<RollingWindowResult>;
}
