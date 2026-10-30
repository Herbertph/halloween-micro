export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_LONG_EDGE = 1536;
export const UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export type UploadErrorCode =
  | "unsupported_format"
  | "file_too_large"
  | "decode_failed";

export const UPLOAD_MESSAGES: Record<UploadErrorCode, string> = {
  unsupported_format:
    "That file type isn't supported. Use a JPG, PNG or WEBP.",
  file_too_large: "That photo is too large. The limit is 10 MB.",
  decode_failed:
    "iPhone photos in HEIC can't be read here — export as JPG and try again.",
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: UploadErrorCode; message: string };

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function isHeic(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.hei[cf]$/i.test(file.name)
  );
}

export function validateUploadFile(file: File): ValidationResult {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      message: UPLOAD_MESSAGES.file_too_large,
    };
  }
  const supported =
    SUPPORTED_TYPES.has(file.type.toLowerCase()) || isHeic(file);
  if (!supported) {
    return {
      ok: false,
      code: "unsupported_format",
      message: UPLOAD_MESSAGES.unsupported_format,
    };
  }
  return { ok: true };
}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to the <img> decoder (older Safari).
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed"));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

const HEIC_CONVERSION_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Keep the abandoned promise from raising an unhandled rejection.
  promise.catch(() => undefined);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("decode_failed")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function convertHeic(file: File): Promise<Blob> {
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await withTimeout(
      heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 }),
      HEIC_CONVERSION_TIMEOUT_MS,
    );
    const blob = Array.isArray(converted) ? converted[0] : converted;
    if (!blob) throw new Error("decode_failed");
    return blob;
  } catch {
    // A blocked/failed worker must surface as a fallback message, never a hang.
    throw new Error("decode_failed");
  }
}

/**
 * Browser-side pipeline: HEIC best-effort conversion, long edge capped at
 * 1536 px, JPEG re-encode at quality 0.9. Re-encoding through a canvas also
 * drops client metadata before the file is uploaded.
 */
export async function prepareImage(file: File): Promise<File> {
  const validation = validateUploadFile(file);
  if (!validation.ok) {
    const error = new Error(validation.code) as Error & { code: UploadErrorCode };
    error.code = validation.code;
    throw error;
  }

  let decoded: Awaited<ReturnType<typeof decode>> | null = null;
  if (isHeic(file)) {
    // Safari can decode HEIC natively; skip the WASM decoder when it can.
    try {
      decoded = await decode(file);
    } catch {
      decoded = null;
    }
  }

  if (!decoded) {
    const source = isHeic(file) ? await convertHeic(file) : file;
    try {
      decoded = await decode(source);
    } catch {
      throw new Error("decode_failed");
    }
  }

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("decode_failed");
  context.drawImage(decoded.source, 0, 0, width, height);

  const blob = await canvasToJpeg(canvas);
  return new File([blob], "haunted-upload.jpg", { type: "image/jpeg" });
}
