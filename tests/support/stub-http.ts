import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Socket } from "node:net";

export interface StubRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface StubReply {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Never answer; used to exercise client timeouts. */
  hang?: boolean;
}

export type StubHandler = (
  request: StubRequest,
) => StubReply | Promise<StubReply>;

async function readBody(request: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Minimal local HTTP server on an ephemeral port for provider-driver tests.
 * Never uses a fixed port (in particular not 3000, 3101 or 4545).
 */
export async function startStub(handler: StubHandler): Promise<{
  url: string;
  requests: StubRequest[];
  close: () => Promise<void>;
}> {
  const requests: StubRequest[] = [];
  const sockets = new Set<Socket>();

  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    const captured: StubRequest = {
      method: request.method ?? "GET",
      url: request.url ?? "/",
      headers: request.headers,
      body,
    };
    requests.push(captured);

    try {
      const reply = await handler(captured);
      if (reply.hang) return;
      response.writeHead(reply.status ?? 200, {
        "content-type": "text/plain",
        ...(reply.headers ?? {}),
      });
      response.end(reply.body ?? "");
    } catch {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("stub error");
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
