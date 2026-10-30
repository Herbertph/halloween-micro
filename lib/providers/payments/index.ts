import { paymentProviderName } from "@/lib/env";

import { MockPaymentsProvider } from "./mock";
import { StripePaymentsProvider } from "./stripe";
import type { PaymentsProvider } from "./types";

export type {
  CreateSessionInput,
  CreateSessionResult,
  PaymentsProvider,
} from "./types";

export { PAYMENT_COMPLETED_EVENT } from "./types";

export function getPaymentsProvider(
  name = paymentProviderName(),
): PaymentsProvider {
  switch (name) {
    case "mock":
      return new MockPaymentsProvider();
    case "stripe":
      return new StripePaymentsProvider();
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${name}`);
  }
}
