import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  detectImageType,
  imageDimensions,
  isFeatureless,
  makePreview,
  stripMetadata,
} from "@/lib/images";
import { MockImageProvider } from "@/lib/providers/image/mock";

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "tests", "fixtures", name));
}

describe("image pipeline", () => {
  it("AC-8: strips EXIF and GPS from the stored original and the result", async () => {
    const withExif = await fixture("gps.jpg");
    expect(withExif.includes(Buffer.from("Fixture Camera"))).toBe(true);

    const stripped = await stripMetadata(withExif);
    const strippedMetadata = await sharp(stripped).metadata();
    expect(strippedMetadata.exif).toBeUndefined();
    expect(stripped.includes(Buffer.from("Fixture Camera"))).toBe(false);

    const provider = new MockImageProvider();
    const result = await provider.generatePortrait({
      image: stripped,
      styleId: "witch",
    });
    if (!("fullRes" in result)) throw new Error("mock provider failed");
    const resultMetadata = await sharp(result.fullRes).metadata();
    expect(resultMetadata.exif).toBeUndefined();
    expect(result.fullRes.includes(Buffer.from("Fixture Camera"))).toBe(false);
  });

  it("AC-6: derives a preview of at most 512 px on the long edge", async () => {
    const source = await fixture("valid.jpg");
    const preview = await makePreview(source, "haunted.example");
    const { width, height } = await imageDimensions(preview);
    expect(Math.max(width, height)).toBeLessThanOrEqual(512);
    expect(Math.min(width, height)).toBeGreaterThan(50);
  });

  it("AC-6: the preview is visibly watermarked", async () => {
    const source = await fixture("valid.jpg");
    const preview = await makePreview(source, "haunted.example");
    const resized = await sharp(source)
      .resize({ width: 512, height: 512, fit: "inside" })
      .jpeg({ quality: 84 })
      .toBuffer();
    expect(preview.equals(resized)).toBe(false);
    const previewStats = await sharp(preview).stats();
    const plainStats = await sharp(resized).stats();
    expect(previewStats.channels[0].mean).not.toBe(plainStats.channels[0].mean);
  });

  it("sniffs image types from magic bytes", async () => {
    expect(detectImageType(await fixture("valid.jpg"))).toBe("jpeg");
    expect(detectImageType(await fixture("valid.png"))).toBe("png");
    expect(detectImageType(Buffer.from("GIF89a not an image"))).toBeNull();
  });

  it("detects a featureless image", async () => {
    expect(await isFeatureless(await fixture("blank.jpg"))).toBe(true);
    expect(await isFeatureless(await fixture("valid.jpg"))).toBe(false);
  });
});
