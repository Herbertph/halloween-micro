// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CreateForm } from "@/components/create/CreateForm";

const STYLES = [{ id: "pumpkin" as const, name: "Pumpkin", description: "Lantern" }];

describe("Turnstile widget", () => {
  it("AC-20: is not rendered when enforcement is off", () => {
    const { container } = render(
      <CreateForm styles={STYLES} priceLabel="$4.99" />,
    );
    expect(container.querySelector(".cf-turnstile")).toBeNull();
  });

  it("AC-19: renders when a site key is provided", async () => {
    const { container } = render(
      <CreateForm
        styles={STYLES}
        priceLabel="$4.99"
        turnstileSiteKey="1x00000000000000000000AA"
      />,
    );
    await screen.findByText(/quick Cloudflare check/i);
    const widget = container.querySelector(".cf-turnstile");
    expect(widget).not.toBeNull();
    expect(widget?.getAttribute("data-sitekey")).toBe("1x00000000000000000000AA");
  });
});
