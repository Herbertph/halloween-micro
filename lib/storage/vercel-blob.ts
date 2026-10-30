import { StorageError, type Storage } from "./types";

const API_ROOT = "https://blob.vercel-storage.com";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Vercel Blob driver. Production only. Every request is bounded by a timeout so
 * a hanging blob service cannot block a serverless function; failures are typed
 * so callers can return a retryable user error.
 */
export class VercelBlobStorage implements Storage {
  constructor(
    private readonly token: string,
    private readonly apiRoot = API_ROOT,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        throw new StorageError(
          "timeout",
          `Blob request timed out after ${this.timeoutMs} ms`,
        );
      }
      throw new StorageError(
        "network",
        `Blob request failed: ${(error as Error)?.message ?? "network error"}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async put(key: string, data: Buffer, contentType = "application/octet-stream") {
    const response = await this.request(`${this.apiRoot}/${key}`, {
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
      throw new StorageError(
        "http",
        `Blob upload failed: ${response.status}`,
        response.status,
      );
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const response = await this.request(`${this.apiRoot}/${key}`, {
      headers: {
        authorization: `Bearer ${this.token}`,
        "x-api-version": "7",
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new StorageError(
        "http",
        `Blob download failed: ${response.status}`,
        response.status,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await this.request(`${this.apiRoot}/delete`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "x-api-version": "7",
        "content-type": "application/json",
      },
      body: JSON.stringify({ urls: [`${this.apiRoot}/${key}`] }),
    });
    if (!response.ok && response.status !== 404) {
      throw new StorageError(
        "http",
        `Blob delete failed: ${response.status}`,
        response.status,
      );
    }
  }
}
