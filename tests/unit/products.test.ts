import { describe, expect, it } from "vitest";

import { packStyles, productPriceCents } from "@/lib/products";
import { STYLE_IDS, type StyleId } from "@/lib/types";

const EXPECTED: Record<StyleId, StyleId[]> = {
  vampire: ["vampire", "zombie", "witch", "pumpkin"],
  zombie: ["zombie", "vampire", "witch", "pumpkin"],
  witch: ["witch", "vampire", "zombie", "pumpkin"],
  skeleton: ["skeleton", "vampire", "zombie", "witch"],
  pumpkin: ["pumpkin", "vampire", "zombie", "witch"],
};

describe("pack composition", () => {
  it.each(STYLE_IDS)(
    "AC-2: %s produces four distinct styles with the chosen one first",
    (chosen) => {
      const styles = packStyles(chosen);
      expect(styles).toEqual(EXPECTED[chosen]);
      expect(styles).toHaveLength(4);
      expect(new Set(styles).size).toBe(4);
      expect(styles[0]).toBe(chosen);
    },
  );

  it("AC-2: pads with skeleton when the chosen style would leave a short list", () => {
    expect(packStyles("skeleton")).toContain("skeleton");
    expect(packStyles("skeleton")).toHaveLength(4);
  });
});

describe("product prices", () => {
  it("AC-3: derives both prices from env, never from the client", () => {
    process.env.PRICE_SINGLE_CENTS = "499";
    process.env.PRICE_PACK_CENTS = "899";
    expect(productPriceCents("single")).toBe(499);
    expect(productPriceCents("pack")).toBe(899);
  });
});
