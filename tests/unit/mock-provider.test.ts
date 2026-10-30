import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MockImageProvider } from "@/lib/providers/image/mock";

const provider = new MockImageProvider();

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "tests", "fixtures", name));
}

describe("MockImageProvider", () => {
  it("AC-7: is deterministic for the same input and style", async () => {
    const image = await fixture("valid.jpg");
    const first = await provider.generatePortrait({ image, styleId: "vampire" });
    const second = await provider.generatePortrait({ image, styleId: "vampire" });
    expect("fullRes" in first && "fullRes" in second).toBe(true);
    if ("fullRes" in first && "fullRes" in second) {
      expect(first.fullRes.equals(second.fullRes)).toBe(true);
      expect(first.fullRes.length).toBeGreaterThan(1000);
    }
  });

  it("AC-7: differs per style for the same input", async () => {
    const image = await fixture("valid.jpg");
    const vampire = await provider.generatePortrait({ image, styleId: "vampire" });
    const skeleton = await provider.generatePortrait({ image, styleId: "skeleton" });
    expect("fullRes" in vampire && "fullRes" in skeleton).toBe(true);
    if ("fullRes" in vampire && "fullRes" in skeleton) {
      expect(vampire.fullRes.equals(skeleton.fullRes)).toBe(false);
    }
  });

  it("AC-9: rejects a featureless image with no_subject", async () => {
    const image = await fixture("blank.jpg");
    const result = await provider.generatePortrait({ image, styleId: "pumpkin" });
    expect(result).toEqual({ error: "no_subject" });
  });
});
