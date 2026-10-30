import { afterEach, describe, expect, it } from "vitest";

import MockCheckoutPage from "@/app/checkout/mock/page";

afterEach(() => {
  process.env.PAYMENT_PROVIDER = "mock";
});

describe("/checkout/mock", () => {
  it("AC-22: returns 404 when PAYMENT_PROVIDER=stripe", async () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    await expect(
      MockCheckoutPage({ searchParams: Promise.resolve({ session: "cs_x" }) }),
    ).rejects.toThrow();
  });

  it("AC-22: returns 404 for an unknown session", async () => {
    process.env.PAYMENT_PROVIDER = "mock";
    await expect(
      MockCheckoutPage({ searchParams: Promise.resolve({ session: "cs_missing" }) }),
    ).rejects.toThrow();
  });
});
