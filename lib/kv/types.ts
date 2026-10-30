export interface SetOptions {
  /** Expiry in seconds. */
  exSeconds?: number;
}

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Increments a counter atomically and applies the TTL on first write. */
  incr(key: string, exSeconds?: number): Promise<number>;
}
