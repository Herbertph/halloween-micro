import type { Storage } from "./types";

const API_ROOT = "https://blob.vercel-storage.com";

/**
 * Vercel Blob driver. Production only; exercised by configuration, not by the
 * test suite (no token in this increment). Private objects are read back with
 * the token, so no public URL ever leaks a full-resolution file.
 */
export class VercelBlobStorage implements Storage {
  constructor(
    private readonly token: string,
    private readonly apiRoot = API_ROOT,
  ) {}

  async put(key: string, data: Buffer, contentType = "application/octet-stream") {
    const response = await fetch(`${this.apiRoot}/${key}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${this.token}`,
        "x-api-version": "7",
        "x-content-type": contentType,
        "x-add-random-suffix": "0",
        "x-vercel-blob-access": "private",
      },
      body: new Uint8Array(data),
    });
    if (!response.ok) {
      throw new Error(`Blob upload failed: ${response.status}`);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const response = await fetch(`${this.apiRoot}/${key}`, {
      headers: {
        authorization: `Bearer ${this.token}`,
        "x-api-version": "7",
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Blob download failed: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.apiRoot}/delete`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "x-api-version": "7",
        "content-type": "application/json",
      },
      body: JSON.stringify({ urls: [`${this.apiRoot}/${key}`] }),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Blob delete failed: ${response.status}`);
    }
  }
}
