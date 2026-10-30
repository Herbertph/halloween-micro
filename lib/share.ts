import sharp from "sharp";

export interface ImageSize {
  width: number;
  height: number;
}

export interface ShareLayout {
  imageHeight: number;
  leftWidth: number;
  rightWidth: number;
  footerHeight: number;
  width: number;
  height: number;
}

export const SHARE_MAX_LONG_EDGE = 1600;
export const SHARE_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Both source images are scaled to the same height and placed side by side, so
 * neither is stretched and there is no letterbox gap. The long edge stays within
 * 1600 px including the footer band.
 */
export function shareLayout(left: ImageSize, right: ImageSize): ShareLayout {
  const footerHeight = Math.max(48, Math.round(SHARE_MAX_LONG_EDGE * 0.035));
  const maxImageHeight = SHARE_MAX_LONG_EDGE - footerHeight;
  const aspect = left.width / left.height + right.width / right.height;

  let imageHeight = Math.min(900, maxImageHeight);
  let totalWidth = Math.round(imageHeight * aspect);
  if (totalWidth > SHARE_MAX_LONG_EDGE) {
    imageHeight = Math.floor((imageHeight * SHARE_MAX_LONG_EDGE) / totalWidth);
    totalWidth = Math.round(imageHeight * aspect);
  }

  const leftWidth = Math.max(1, Math.round((imageHeight * left.width) / left.height));
  const rightWidth = Math.max(1, Math.round((imageHeight * right.width) / right.height));
  const width = leftWidth + rightWidth;
  return {
    imageHeight,
    leftWidth,
    rightWidth,
    footerHeight,
    width,
    height: imageHeight + footerHeight,
  };
}

function safeText(value: string): string {
  return value.replace(/[<>&"']/g, "");
}

function footerSvg(width: number, height: number, host: string): string {
  const fontSize = Math.max(14, Math.round(height * 0.28));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#08060c"/>
    <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.62)}"
      text-anchor="middle" font-family="sans-serif" font-size="${fontSize}"
      fill="#cbbfae">${safeText(host)}</text>
  </svg>`;
}

interface NormalizedImage {
  data: Buffer;
  width: number;
  height: number;
}

/** Applies EXIF orientation before the dimensions are measured. */
async function normalizeSource(buffer: Buffer): Promise<NormalizedImage> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .jpeg({ quality: 95 })
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) throw new Error("share_source_invalid");
  return { data, width: info.width, height: info.height };
}

async function encodeComposite(
  original: Buffer,
  portrait: Buffer,
  host: string,
): Promise<Buffer> {
  const [leftSource, rightSource] = await Promise.all([
    normalizeSource(original),
    normalizeSource(portrait),
  ]);

  const layout = shareLayout(
    { width: leftSource.width, height: leftSource.height },
    { width: rightSource.width, height: rightSource.height },
  );

  const [left, right] = await Promise.all([
    sharp(leftSource.data)
      .resize({ width: layout.leftWidth, height: layout.imageHeight, fit: "fill" })
      .jpeg({ quality: 88 })
      .toBuffer(),
    sharp(rightSource.data)
      .resize({ width: layout.rightWidth, height: layout.imageHeight, fit: "fill" })
      .jpeg({ quality: 88 })
      .toBuffer(),
  ]);

  const composite = sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 3,
      background: "#08060c",
    },
  }).composite([
    { input: left, left: 0, top: 0 },
    { input: right, left: layout.leftWidth, top: 0 },
    {
      input: Buffer.from(footerSvg(layout.width, layout.footerHeight, host)),
      left: 0,
      top: layout.imageHeight,
    },
  ]);

  let quality = 84;
  let output = await composite.jpeg({ quality }).toBuffer();
  while (output.length > SHARE_MAX_BYTES && quality > 50) {
    quality -= 10;
    output = await composite.jpeg({ quality }).toBuffer();
  }
  return output;
}

/** Builds the before/after JPEG composite used by the share button. */
export async function buildShareImage(input: {
  original: Buffer;
  portrait: Buffer;
  host: string;
}): Promise<Buffer> {
  return encodeComposite(input.original, input.portrait, input.host);
}
