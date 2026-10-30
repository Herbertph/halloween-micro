import sharp from "sharp";

import { isFeatureless } from "@/lib/images";
import type { StyleId } from "@/lib/types";

import type { ImageProvider, ImageProviderInput, ImageProviderResult } from "./types";

interface Grade {
  brightness: number;
  saturation: number;
  hue: number;
  tint?: string;
  grayscale?: boolean;
  vignette: number;
  grain: number;
}

const GRADES: Record<StyleId, Grade> = {
  vampire: {
    brightness: 0.9,
    saturation: 1.25,
    hue: 350,
    tint: "#8d1f35",
    vignette: 0.7,
    grain: 0.07,
  },
  zombie: {
    brightness: 0.95,
    saturation: 0.65,
    hue: 78,
    tint: "#5d7a3a",
    vignette: 0.45,
    grain: 0.12,
  },
  witch: {
    brightness: 0.9,
    saturation: 1.1,
    hue: 268,
    tint: "#6a3fa0",
    vignette: 0.6,
    grain: 0.06,
  },
  skeleton: {
    brightness: 1.05,
    saturation: 0,
    hue: 0,
    grayscale: true,
    vignette: 0.5,
    grain: 0.08,
  },
  pumpkin: {
    brightness: 1.02,
    saturation: 1.3,
    hue: 24,
    tint: "#c55a12",
    vignette: 0.55,
    grain: 0.06,
  },
};

function overlaySvg(width: number, height: number, grade: Grade): string {
  const labelSize = Math.max(18, Math.round(width / 20));
  const cy = Math.round(height / 2);
  const labelY = Math.round(height - labelSize * 0.8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <radialGradient id="vignette" cx="50%" cy="45%" r="72%">
        <stop offset="52%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,${grade.vignette})"/>
      </radialGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#vignette)"/>
    <rect width="100%" height="100%" filter="url(#grain)" opacity="${grade.grain}"/>
    <rect x="0" y="${labelY - labelSize}" width="${labelSize * 4.6}" height="${labelSize * 1.6}"
      fill="rgba(8,6,12,0.62)" rx="${Math.round(labelSize / 3)}"/>
    <text x="${Math.round(labelSize * 0.5)}" y="${labelY}" font-family="sans-serif"
      font-size="${labelSize}" font-weight="700" fill="#ffb347"
      letter-spacing="3">MOCK</text>
    <text x="${width - 14}" y="${cy}" text-anchor="end" font-family="sans-serif"
      font-size="${Math.max(11, Math.round(width / 60))}"
      fill="rgba(255,255,255,0.55)">mock provider</text>
  </svg>`;
}

/**
 * Offline demo provider: a deterministic stylised derivative of the input.
 * Same bytes in, same bytes out; each style grades differently. A featureless
 * image (uniform colour) reports `no_subject` so that path stays testable.
 */
export class MockImageProvider implements ImageProvider {
  async generatePortrait(
    input: ImageProviderInput,
  ): Promise<ImageProviderResult> {
    try {
      if (await isFeatureless(input.image)) {
        return { error: "no_subject" };
      }
      const grade = GRADES[input.styleId];
      let pipeline = sharp(input.image, { failOn: "none" })
        .rotate()
        .resize({
          width: 1536,
          height: 1536,
          fit: "inside",
          withoutEnlargement: true,
        });

      if (grade.grayscale) pipeline = pipeline.grayscale();
      pipeline = pipeline.modulate({
        brightness: grade.brightness,
        saturation: grade.saturation,
        hue: grade.hue,
      });
      if (grade.tint) pipeline = pipeline.tint(grade.tint);

      const graded = await pipeline.toBuffer();
      const metadata = await sharp(graded).metadata();
      const width = metadata.width ?? 512;
      const height = metadata.height ?? 512;

      const fullRes = await sharp(graded)
        .composite([{ input: Buffer.from(overlaySvg(width, height, grade)) }])
        .jpeg({ quality: 88 })
        .toBuffer();

      return { fullRes };
    } catch {
      return { error: "fatal" };
    }
  }
}
