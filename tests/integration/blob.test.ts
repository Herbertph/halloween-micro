import { describe, expect, it } from "vitest";

import { StorageError } from "@/lib/storage/types";
import { VercelBlobStorage } from "@/lib/storage/vercel-blob";
import { startStub } from "../support/stub-http";

const TOKEN = "blob-test-token";
const KEY = "jobs/probe.jpg";
const BYTES = Buffer.from("blob-probe-bytes");

describe("Vercel Blob driver", () => {
  it("G3-AC-9: probe flow sends the documented requests and returns the written bytes", async () => {
    const stub = await startStub((request) => {
      if (request.method === "PUT") {
        return { status: 200, headers: { "content-type": "application/json" }, body: "{}" };
      }
      if (request.method === "GET") {
        return { status: 200, headers: { "content-type": "image/jpeg" }, body: BYTES };
      }
      if (request.method === "POST" && request.url === "/delete") {
        return { status: 200, headers: { "content-type": "application/json" }, body: "{}" };
      }
      return { status: 404, body: "not found" };
    });

    try {
      const storage = new VercelBlobStorage(TOKEN, stub.url, 1_000);
      await storage.put(KEY, BYTES, "image/jpeg");
      expect(await storage.get(KEY)).toEqual(BYTES);
      await storage.delete(KEY);

      const [put, get, remove] = stub.requests;
      expect(put.method).toBe("PUT");
      expect(put.url).toBe(`/${KEY}`);
      expect(put.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(put.headers["x-api-version"]).toBe("7");
      expect(put.headers["x-content-type"]).toBe("image/jpeg");
      expect(put.headers["x-add-random-suffix"]).toBe("0");
      expect(put.headers["x-vercel-blob-access"]).toBe("private");
      expect(put.body.equals(BYTES)).toBe(true);

      expect(get.method).toBe("GET");
      expect(get.url).toBe(`/${KEY}`);
      expect(get.headers.authorization).toBe(`Bearer ${TOKEN}`);

      expect(remove.method).toBe("POST");
      expect(remove.url).toBe("/delete");
      expect(JSON.parse(remove.body.toString("utf8"))).toEqual({
        urls: [`${stub.url}/${KEY}`],
      });
    } finally {
      await stub.close();
    }
  });

  it("G3-AC-9: a 403 becomes a typed retryable storage error", async () => {
    const stub = await startStub(() => ({ status: 403, body: "denied" }));
    try {
      const storage = new VercelBlobStorage(TOKEN, stub.url, 1_000);
      await expect(storage.put(KEY, BYTES)).rejects.toMatchObject({
        name: "StorageError",
        code: "http",
        status: 403,
        retryable: true,
      });
      await expect(storage.put(KEY, BYTES)).rejects.toBeInstanceOf(StorageError);
    } finally {
      await stub.close();
    }
  });

  it("G3-AC-9: a hanging response hits the timeout instead of blocking", async () => {
    const stub = await startStub(() => ({ hang: true }));
    try {
      const storage = new VercelBlobStorage(TOKEN, stub.url, 120);
      const started = Date.now();
      await expect(storage.get(KEY)).rejects.toMatchObject({
        name: "StorageError",
        code: "timeout",
        retryable: true,
      });
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await stub.close();
    }
  });
});
