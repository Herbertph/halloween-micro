import type { ConfigSnapshot } from "./config-check";

/**
 * A deliberate demo deploy is production + the opt-in flag + a mock payment
 * provider. Real payments are never labelled "no real payment".
 */
export function isDemoMode(env: ConfigSnapshot = process.env): boolean {
  const payment = (env.PAYMENT_PROVIDER || "mock").toLowerCase();
  return (
    env.NODE_ENV === "production" &&
    env.ALLOW_MOCK_PROVIDERS === "true" &&
    payment === "mock"
  );
}
