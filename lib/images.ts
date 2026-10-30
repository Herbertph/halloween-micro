import sharp from "sharp";

export type ImageType = "jpeg" | "png" | "webp";

const CONTENT_TYPES: Record<ImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function contentTypeFor(type: ImageType): string {
  return CONTENT_TYPES[type];
}

/** Magic-byte sniffing; the MIME header is never trusted. */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Decodes, applies EXIF orientation and re-encodes as JPEG. sharp drops every
 * metadata tag (including GPS) unless metadata is explicitly copied, and this
 * pipeline never copies it.
 */
export async function stripMetadata(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function imageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Image has no dimensions");
  }
  return { width: metadata.width, height: metadata.height };
}

function watermarkSvg(width: number, height: number, host: string): string {
  const tile = Math.max(140, Math.round(width / 3));
  const fontSize = Math.max(18, Math.round(width / 16));
  const labelSize = Math.max(11, Math.round(width / 42));
  const safeHost = host.replace(/[<>&"']/g, "");
  const y = Math.round(height - labelSize - 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <pattern id="wm" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
        <text x="0" y="${Math.round(tile * 0.6)}" font-family="sans-serif" font-size="${fontSize}"
          font-weight="700" fill="rgba(255,255,255,0.34)" stroke="rgba(0,0,0,0.35)"
          stroke-width="1">PREVIEW</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm)"/>
    <text x="${width - 10}" y="${y}" text-anchor="end" font-family="sans-serif"
      font-size="${labelSize}" fill="rgba(255,255,255,0.9)"
      stroke="rgba(0,0,0,0.45)" stroke-width="0.6">${safeHost}</text>
  </svg>`;
}

/**
 * Derives the only image a visitor may see before paying: long edge at most
 * 512 px, diagonally watermarked with "PREVIEW" plus the site host.
 */
export async function makePreview(
  fullRes: Buffer,
  host: string,
): Promise<Buffer> {
  const resized = await sharp(fullRes, { failOn: "none" })
    .rotate()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer();
  const { width, height } = await imageDimensions(resized);
  return sharp(resized)
    .composite([{ input: Buffer.from(watermarkSvg(width, height, host)) }])
    .jpeg({ quality: 84 })
    .toBuffer();
}

/** True when the image has no detectable subject (uniform colour). */
export async function isFeatureless(buffer: Buffer): Promise<boolean> {
  const stats = await sharp(buffer, { failOn: "none" }).stats();
  const deviations = stats.channels.map((channel) => channel.stdev);
  return Math.max(...deviations) < 2.5;
}
