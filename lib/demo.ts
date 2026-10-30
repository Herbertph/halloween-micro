import type { ConfigSnapshot } from "./config-check";

/**
 * A deliberate demo deploy is production + the opt-in flag. The visible label
 * prevents a mock deployment from being mistaken for a real shop.
 */
export function isDemoMode(env: ConfigSnapshot = process.env): boolean {
  return env.NODE_ENV === "production" && env.ALLOW_MOCK_PROVIDERS === "true";
}
