import { paymentProviderName } from "@/lib/env";

/** The mock checkout only exists while the mock provider is active. */
export function mockCheckoutEnabled(name = paymentProviderName()): boolean {
  return name === "mock";
}
