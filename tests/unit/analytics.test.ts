// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { track } from "@/lib/analytics";

afterEach(() => {
  delete (window as unknown as { plausible?: unknown }).plausible;
});

describe("Plausible analytics", () => {
  it("FR-33: is a no-op when no Plausible script is configured", () => {
    expect(() => track("upload_started")).not.toThrow();
  });

  it("FR-33: forwards events when the Plausible stub is present", () => {
    const plausible = vi.fn();
    (window as unknown as { plausible: typeof plausible }).plausible = plausible;
    track("checkout_clicked", { style: "vampire" });
    expect(plausible).toHaveBeenCalledWith("checkout_clicked", {
      props: { style: "vampire" },
    });
  });
});
