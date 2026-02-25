import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NodeFileSystem } from "../adapters/node/node-filesystem.js";
import { defaultConfig } from "../config/server-config.js";
import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
} from "../interfaces/socket.js";
import { InMemorySocketFactory } from "../testing/in-memory-socket-factory.js";
import { decodeToString } from "../utils/buffer.js";
import { WebServer } from "./web-server.js";

interface ParsedResponse {
  status: number;
  headers: Map<string, string>;
  body: string;
}

async function createSymlinkIfSupported(
  target: string,
  linkPath: string,
): Promise<boolean> {
  try {
    await fs.symlink(target, linkPath);
    return true;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
      return false;
    }
    throw err;
  }
}

function parseResponse(raw: Uint8Array): ParsedResponse {
  const text = decodeToString(raw);
  const splitAt = text.indexOf("\r\n\r\n");
  if (splitAt === -1) {
    throw new Error("Invalid HTTP response: missing header separator");
  }

  const headerPart = text.slice(0, splitAt);
  const bodyPart = text.slice(splitAt + 4);
  const lines = headerPart.split("\r\n");
  const statusLine = lines[0];
  const status = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);
  if (Number.isNaN(status)) {
    throw new Error(`Invalid status line: ${statusLine}`);
  }

  const headers = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const colon = lines[i].indexOf(":");
    if (colon === -1) continue;
    const key = lines[i].slice(0, colon).trim().toLowerCase();
    const value = lines[i].slice(colon + 1).trim();
    headers.set(key, value);
  }

  return { status, headers, body: bodyPart };
}

function parseResponses(raw: Uint8Array): ParsedResponse[] {
  const text = decodeToString(raw);
  const responses: ParsedResponse[] = [];
  let offset = 0;

  while (offset < text.length) {
    const splitAt = text.indexOf("\r\n\r\n", offset);
    if (splitAt === -1) {
      throw new Error("Invalid HTTP response stream: missing header separator");
    }

    const headerPart = text.slice(offset, splitAt);
    const lines = headerPart.split("\r\n");
    const statusLine = lines[0];
    const status = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);
    if (Number.isNaN(status)) {
      throw new Error(`Invalid status line: ${statusLine}`);
    }

    const headers = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
      const colon = lines[i].indexOf(":");
      if (colon === -1) continue;
      const key = lines[i].slice(0, colon).trim().toLowerCase();
      const value = lines[i].slice(colon + 1).trim();
      headers.set(key, value);
    }

    const contentLength = Number.parseInt(
      headers.get("content-length") ?? "0",
      10,
    );
    const bodyStart = splitAt + 4;
    const bodyEnd =
      bodyStart + (Number.isNaN(contentLength) ? 0 : contentLength);
    const body = text.slice(bodyStart, bodyEnd);
    responses.push({ status, headers, body });
    offset = bodyEnd;
  }

  return responses;
}

function withConnectionClose(rawHttp: string): string {
  const separator = "\r\n\r\n";
  const headerEnd = rawHttp.indexOf(separator);
  if (headerEnd === -1) {
    return rawHttp;
  }
  const headerPart = rawHttp.slice(0, headerEnd);
  if (/\r\nconnection\s*:/i.test(headerPart)) {
    return rawHttp;
  }
  return `${headerPart}\r\nConnection: close${rawHttp.slice(headerEnd)}`;
}

async function withServer(
  root: string,
  configOverrides: Partial<ReturnType<typeof defaultConfig>>,
  testBody: (ctx: {
    request: (rawHttp: string) => Promise<ParsedResponse>;
  }) => Promise<void>,
): Promise<void> {
  const socketFactory = new InMemorySocketFactory();
  const server = new WebServer({
    socketFactory,
    fileSystem: new NodeFileSystem(),
    config: {
      ...defaultConfig(root),
      quiet: true,
      port: 0,
      ...configOverrides,
    },
  });

  await server.start();

  try {
    await testBody({
      request: async (rawHttp: string) =>
        parseResponse(
          await socketFactory.request(withConnectionClose(rawHttp)),
        ),
    });
  } finally {
    await server.stop();
  }
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ok200-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("WebServer integration (in-memory)", () => {
  it("serves a file with correct content-type", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "Hello, world!");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /hello.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe("Hello, world!");
      expect(res.headers.get("content-type")).toContain("text/plain");
    });
  });

  it("serves index.html for directory", async () => {
    await fs.writeFile(path.join(tmpDir, "index.html"), "<h1>Home</h1>");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request("GET / HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(200);
      expect(res.body).toBe("<h1>Home</h1>");
    });
  });

  it("returns directory listing when no index.html", async () => {
    try {
      await fs.unlink(path.join(tmpDir, "index.html"));
    } catch {}

    await fs.writeFile(path.join(tmpDir, "file-a.txt"), "a");
    await fs.writeFile(path.join(tmpDir, "file-b.txt"), "b");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request("GET / HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(200);
      expect(res.body).toContain("file-a.txt");
      expect(res.body).toContain("file-b.txt");
      expect(res.body).toContain("Index of /");
    });
  });

  it("returns 404 for missing file", async () => {
    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /nonexistent.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(404);
    });
  });

  it("returns 404 to HEAD without a response body", async () => {
    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "HEAD /missing.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(404);
      expect(res.body).toBe("");
      expect(res.headers.get("content-length")).toBe("9");
    });
  });

  it("blocks path traversal via raw request", async () => {
    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /../../etc/passwd HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.body).not.toContain("root:");
      expect([200, 404]).toContain(res.status);
    });
  });

  it("blocks symlink targets that escape the root", async () => {
    const outsideDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "ok200-outside-"),
    );
    const outsideFile = path.join(outsideDir, "secret.txt");
    const linkPath = path.join(tmpDir, "escape-link.txt");
    await fs.writeFile(outsideFile, "outside secret");
    await fs.rm(linkPath, { force: true });

    try {
      const created = await createSymlinkIfSupported(outsideFile, linkPath);
      if (!created) return;

      await withServer(tmpDir, {}, async ({ request }) => {
        const res = await request(
          "GET /escape-link.txt HTTP/1.1\r\nHost: local\r\n\r\n",
        );
        expect(res.status).toBe(403);
        expect(res.body).toBe("Forbidden");
      });
    } finally {
      await fs.rm(linkPath, { force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("allows symlinks that resolve inside the root", async () => {
    const targetPath = path.join(tmpDir, "inside-target.txt");
    const linkPath = path.join(tmpDir, "inside-link.txt");
    await fs.writeFile(targetPath, "inside");
    await fs.rm(linkPath, { force: true });

    try {
      const created = await createSymlinkIfSupported(targetPath, linkPath);
      if (!created) return;

      await withServer(tmpDir, {}, async ({ request }) => {
        const res = await request(
          "GET /inside-link.txt HTTP/1.1\r\nHost: local\r\n\r\n",
        );
        expect(res.status).toBe(200);
        expect(res.body).toBe("inside");
      });
    } finally {
      await fs.rm(linkPath, { force: true });
      await fs.rm(targetPath, { force: true });
    }
  });

  it("handles HEAD request", async () => {
    await fs.writeFile(path.join(tmpDir, "head-test.txt"), "test content");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "HEAD /head-test.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe("");
      expect(res.headers.get("content-length")).toBe("12");
    });
  });

  it("handles HEAD request for directory listing without body", async () => {
    try {
      await fs.unlink(path.join(tmpDir, "index.html"));
    } catch {}
    await fs.writeFile(path.join(tmpDir, "listing-only.txt"), "x");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request("HEAD / HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(200);
      expect(res.body).toBe("");
      expect(
        Number.parseInt(res.headers.get("content-length") ?? "0", 10),
      ).toBeGreaterThan(0);
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });

  it("returns 405 for POST", async () => {
    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request("POST / HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(405);
    });
  });

  it("serves JSON with correct content-type", async () => {
    await fs.writeFile(path.join(tmpDir, "data.json"), '{"ok":true}');

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /data.json HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.body).toBe('{"ok":true}');
    });
  });

  it("serves subdirectory files", async () => {
    await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "sub", "nested.txt"),
      "nested content",
    );

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /sub/nested.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe("nested content");
    });
  });

  it("serves single-byte ranges with 206 and Content-Range", async () => {
    await fs.writeFile(path.join(tmpDir, "range.txt"), "0123456789");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /range.txt HTTP/1.1\r\nHost: local\r\nRange: bytes=2-5\r\n\r\n",
      );
      expect(res.status).toBe(206);
      expect(res.body).toBe("2345");
      expect(res.headers.get("accept-ranges")).toBe("bytes");
      expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(res.headers.get("content-length")).toBe("4");
    });
  });

  it("supports suffix ranges", async () => {
    await fs.writeFile(path.join(tmpDir, "range-suffix.txt"), "abcdefghij");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /range-suffix.txt HTTP/1.1\r\nHost: local\r\nRange: bytes=-3\r\n\r\n",
      );
      expect(res.status).toBe(206);
      expect(res.body).toBe("hij");
      expect(res.headers.get("content-range")).toBe("bytes 7-9/10");
      expect(res.headers.get("content-length")).toBe("3");
    });
  });

  it("supports HEAD range requests without a response body", async () => {
    await fs.writeFile(path.join(tmpDir, "range-head.txt"), "abcdefghij");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "HEAD /range-head.txt HTTP/1.1\r\nHost: local\r\nRange: bytes=1-3\r\n\r\n",
      );
      expect(res.status).toBe(206);
      expect(res.body).toBe("");
      expect(res.headers.get("content-range")).toBe("bytes 1-3/10");
      expect(res.headers.get("content-length")).toBe("3");
    });
  });

  it("returns 416 for unsatisfiable ranges", async () => {
    await fs.writeFile(path.join(tmpDir, "range-416.txt"), "abc");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /range-416.txt HTTP/1.1\r\nHost: local\r\nRange: bytes=100-200\r\n\r\n",
      );
      expect(res.status).toBe(416);
      expect(res.headers.get("content-range")).toBe("bytes */3");
      expect(res.body).toBe("Range Not Satisfiable");
    });
  });

  it("keeps HTTP/1.1 connections open across requests", async () => {
    await fs.writeFile(path.join(tmpDir, "keepalive.txt"), "alive");

    const socketFactory = new InMemorySocketFactory();
    const server = new WebServer({
      socketFactory,
      fileSystem: new NodeFileSystem(),
      config: {
        ...defaultConfig(tmpDir),
        quiet: true,
        port: 0,
      },
    });

    await server.start();
    try {
      const raw = await socketFactory.request(
        [
          "GET /keepalive.txt HTTP/1.1",
          "Host: local",
          "Connection: keep-alive",
          "",
          "GET /keepalive.txt HTTP/1.1",
          "Host: local",
          "Connection: close",
          "",
          "",
        ].join("\r\n"),
      );

      const responses = parseResponses(raw);
      expect(responses).toHaveLength(2);
      expect(responses[0].status).toBe(200);
      expect(responses[0].body).toBe("alive");
      expect(responses[0].headers.get("connection")).toBe("keep-alive");
      expect(responses[1].status).toBe(200);
      expect(responses[1].body).toBe("alive");
      expect(responses[1].headers.get("connection")).toBe("close");
    } finally {
      await server.stop();
    }
  });
});

describe("WebServer SPA mode (in-memory)", () => {
  it("serves index.html for missing paths in SPA mode", async () => {
    await fs.writeFile(path.join(tmpDir, "index.html"), '<div id="app"></div>');

    await withServer(tmpDir, { spa: true }, async ({ request }) => {
      const res = await request(
        "GET /some/route HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe('<div id="app"></div>');
    });
  });
});

describe("WebServer CORS (in-memory)", () => {
  it("includes CORS headers", async () => {
    await fs.writeFile(path.join(tmpDir, "cors.txt"), "test");

    await withServer(tmpDir, { cors: true }, async ({ request }) => {
      const res = await request(
        "GET /cors.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  it("handles OPTIONS preflight", async () => {
    await withServer(tmpDir, { cors: true }, async ({ request }) => {
      const res = await request(
        "OPTIONS /anything HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.body).toBe("");
    });
  });
});

class FailingTcpServer implements ITcpServer {
  private errorCb: ((err: Error) => void) | null = null;

  listen(_port: number, _host?: string, _callback?: () => void): void {
    queueMicrotask(() => {
      this.errorCb?.(new Error("bind failed"));
    });
  }

  address(): { port: number } | null {
    return null;
  }

  on(event: "connection", cb: (socket: unknown) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(
    event: "connection" | "error",
    cb: ((socket: unknown) => void) | ((err: Error) => void),
  ): void {
    if (event === "error") {
      this.errorCb = cb as (err: Error) => void;
    }
  }

  close(callback?: () => void): void {
    callback?.();
  }
}

class FailingSocketFactory implements ISocketFactory {
  async createTcpSocket(): Promise<ITcpSocket> {
    throw new Error("not used");
  }

  createTcpServer(): ITcpServer {
    return new FailingTcpServer();
  }

  wrapTcpSocket(_socket: unknown): ITcpSocket {
    throw new Error("not used");
  }
}

class DelayedCloseTcpServer implements ITcpServer {
  constructor(private readonly onCloseDone: () => void) {}

  listen(_port: number, _host?: string, callback?: () => void): void {
    queueMicrotask(() => callback?.());
  }

  address(): { port: number } | null {
    return { port: 43210 };
  }

  on(_event: "connection", _cb: (socket: unknown) => void): void;
  on(_event: "error", _cb: (err: Error) => void): void;
  on(
    _event: "connection" | "error",
    _cb: ((socket: unknown) => void) | ((err: Error) => void),
  ): void {
    // No-op for this lifecycle test server.
  }

  close(callback?: () => void): void {
    setTimeout(() => {
      this.onCloseDone();
      callback?.();
    }, 20);
  }
}

class DelayedCloseSocketFactory implements ISocketFactory {
  closeFinished = false;

  async createTcpSocket(): Promise<ITcpSocket> {
    throw new Error("not used");
  }

  createTcpServer(): ITcpServer {
    return new DelayedCloseTcpServer(() => {
      this.closeFinished = true;
    });
  }

  wrapTcpSocket(_socket: unknown): ITcpSocket {
    throw new Error("not used");
  }
}

describe("WebServer lifecycle", () => {
  it("rejects start() on listen errors", async () => {
    const server = new WebServer({
      socketFactory: new FailingSocketFactory(),
      fileSystem: new NodeFileSystem(),
      config: {
        ...defaultConfig(tmpDir),
        quiet: true,
      },
    });

    await expect(server.start()).rejects.toThrow("bind failed");
  });

  it("waits for close callback before resolving stop()", async () => {
    const socketFactory = new DelayedCloseSocketFactory();
    const server = new WebServer({
      socketFactory,
      fileSystem: new NodeFileSystem(),
      config: {
        ...defaultConfig(tmpDir),
        quiet: true,
      },
    });

    await server.start();
    const stopping = server.stop();
    await Promise.resolve();
    expect(socketFactory.closeFinished).toBe(false);
    await stopping;
    expect(socketFactory.closeFinished).toBe(true);
  });
});
