import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildShareImage, shareLayout } from "@/lib/share";

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "tests", "fixtures", name));
}

const HOST = "haunted.example";

describe("share layout", () => {
  it("AC-14: portrait and landscape sources get equal halves without stretching", () => {
    const portrait = shareLayout({ width: 600, height: 900 }, { width: 600, height: 900 });
    expect(portrait.leftWidth).toBe(portrait.rightWidth);
    expect(portrait.width).toBe(portrait.leftWidth + portrait.rightWidth);

    const mixed = shareLayout({ width: 600, height: 900 }, { width: 900, height: 600 });
    // Both halves are scaled to the same height; widths keep their aspect ratios.
    expect(mixed.leftWidth).toBe(
      Math.round((mixed.imageHeight * 600) / 900),
    );
    expect(mixed.rightWidth).toBe(
      Math.round((mixed.imageHeight * 900) / 600),
    );
  });

  it("AC-16: keeps the long edge at or under 1600 px", () => {
    const layout = shareLayout(
      { width: 600, height: 900 },
      { width: 900, height: 600 },
    );
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(1600);
  });
});

describe("share composite", () => {
  it("AC-13: the footer is derived from the site host", async () => {
    const image = await fixture("valid.jpg");
    const first = await buildShareImage({
      original: image,
      portrait: image,
      host: "one.example",
    });
    const second = await buildShareImage({
      original: image,
      portrait: image,
      host: "two.example",
    });
    expect(first.equals(second)).toBe(false);
  });

  it("AC-14: portrait and landscape sources fill equal-height halves", async () => {
    const portrait = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const landscape = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 30, g: 30, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const jpeg = await buildShareImage({
      original: portrait,
      portrait: landscape,
      host: HOST,
    });
    const metadata = await sharp(jpeg).metadata();
    const layout = shareLayout(
      { width: 600, height: 900 },
      { width: 900, height: 600 },
    );
    expect(metadata.width).toBe(layout.width);
    expect(metadata.height).toBe(layout.height);

    const leftBytes = await sharp(jpeg)
      .extract({
        left: 0,
        top: 0,
        width: layout.leftWidth,
        height: layout.imageHeight,
      })
      .toBuffer();
    const rightBytes = await sharp(jpeg)
      .extract({
        left: layout.leftWidth,
        top: 0,
        width: layout.rightWidth,
        height: layout.imageHeight,
      })
      .toBuffer();
    const left = await sharp(leftBytes).stats();
    const right = await sharp(rightBytes).stats();
    expect(left.channels[0].mean).toBeGreaterThan(left.channels[2].mean);
    expect(right.channels[2].mean).toBeGreaterThan(right.channels[0].mean);
  });

  it("AC-13/AC-16: builds a landscape JPEG under 3 MB with a footer", async () => {
    const original = await fixture("valid.jpg");
    const portrait = await fixture("valid.jpg");
    const jpeg = await buildShareImage({ original, portrait, host: HOST });

    expect(jpeg.length).toBeLessThan(3 * 1024 * 1024);
    const metadata = await sharp(jpeg).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBeGreaterThan(metadata.height ?? 0);
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);

    const layout = shareLayout(
      { width: 900, height: 700 },
      { width: 900, height: 700 },
    );
    // The footer band is drawn: its pixels are not a flat fill because the host
    // text is rendered into it.
    const footer = await sharp(jpeg)
      .extract({
        left: 0,
        top: layout.imageHeight,
        width: layout.width,
        height: layout.footerHeight,
      })
      .stats();
    expect(footer.channels[0].stdev).toBeGreaterThan(0.5);
  });
});
