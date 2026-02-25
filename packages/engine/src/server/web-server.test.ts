import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NodeFileSystem } from "../adapters/node/node-filesystem.js";
import { defaultConfig } from "../config/server-config.js";
import { decodeToString } from "../utils/buffer.js";
import { InMemorySocketFactory } from "../testing/in-memory-socket-factory.js";
import { WebServer } from "./web-server.js";

interface ParsedResponse {
  status: number;
  headers: Map<string, string>;
  body: string;
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

async function withServer(
  root: string,
  configOverrides: Partial<ReturnType<typeof defaultConfig>>,
  testBody: (ctx: { request: (rawHttp: string) => Promise<ParsedResponse> }) => Promise<void>,
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
        parseResponse(await socketFactory.request(rawHttp)),
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
      const res = await request("GET /hello.txt HTTP/1.1\r\nHost: local\r\n\r\n");
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

  it("blocks path traversal via raw request", async () => {
    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /../../etc/passwd HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.body).not.toContain("root:");
      expect([200, 404]).toContain(res.status);
    });
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

  it("returns 405 for POST", async () => {
    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request("POST / HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(405);
    });
  });

  it("serves JSON with correct content-type", async () => {
    await fs.writeFile(path.join(tmpDir, "data.json"), '{"ok":true}');

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request("GET /data.json HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.body).toBe('{"ok":true}');
    });
  });

  it("serves subdirectory files", async () => {
    await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "sub", "nested.txt"), "nested content");

    await withServer(tmpDir, {}, async ({ request }) => {
      const res = await request(
        "GET /sub/nested.txt HTTP/1.1\r\nHost: local\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe("nested content");
    });
  });
});

describe("WebServer SPA mode (in-memory)", () => {
  it("serves index.html for missing paths in SPA mode", async () => {
    await fs.writeFile(path.join(tmpDir, "index.html"), '<div id="app"></div>');

    await withServer(tmpDir, { spa: true }, async ({ request }) => {
      const res = await request("GET /some/route HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(200);
      expect(res.body).toBe('<div id="app"></div>');
    });
  });
});

describe("WebServer CORS (in-memory)", () => {
  it("includes CORS headers", async () => {
    await fs.writeFile(path.join(tmpDir, "cors.txt"), "test");

    await withServer(tmpDir, { cors: true }, async ({ request }) => {
      const res = await request("GET /cors.txt HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  it("handles OPTIONS preflight", async () => {
    await withServer(tmpDir, { cors: true }, async ({ request }) => {
      const res = await request("OPTIONS /anything HTTP/1.1\r\nHost: local\r\n\r\n");
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.body).toBe("");
    });
  });
});
