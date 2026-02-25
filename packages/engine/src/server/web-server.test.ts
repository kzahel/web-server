import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { defaultConfig } from "../config/server-config.js";
import { createNodeServer } from "../presets/node.js";
import type { WebServer } from "./web-server.js";

let server: WebServer;
let port: number;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ok200-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("WebServer integration", () => {
  beforeEach(async () => {
    const config = {
      ...defaultConfig(tmpDir),
      port: 0, // random port
      quiet: true,
    };
    server = createNodeServer({ config });
    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("serves a file with correct content-type", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "Hello, world!");

    const res = await fetch(`http://127.0.0.1:${port}/hello.txt`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe("Hello, world!");

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/plain");
  });

  it("serves index.html for directory", async () => {
    await fs.writeFile(path.join(tmpDir, "index.html"), "<h1>Home</h1>");

    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe("<h1>Home</h1>");
  });

  it("returns directory listing when no index.html", async () => {
    // Remove index.html if it exists from previous test
    try {
      await fs.unlink(path.join(tmpDir, "index.html"));
    } catch {}

    await fs.writeFile(path.join(tmpDir, "file-a.txt"), "a");
    await fs.writeFile(path.join(tmpDir, "file-b.txt"), "b");

    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("file-a.txt");
    expect(body).toContain("file-b.txt");
    expect(body).toContain("Index of /");
  });

  it("returns 404 for missing file", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/nonexistent.txt`);
    expect(res.status).toBe(404);
  });

  it("blocks path traversal via raw socket", async () => {
    // fetch() normalizes URLs, so we must send raw bytes to test traversal
    const net = await import("node:net");
    const response = await new Promise<string>((resolve) => {
      const sock = net.createConnection(port, "127.0.0.1", () => {
        sock.write("GET /../../etc/passwd HTTP/1.1\r\nHost: localhost\r\n\r\n");
      });
      let data = "";
      sock.on("data", (chunk) => {
        data += chunk.toString();
      });
      sock.on("end", () => resolve(data));
    });

    // decodeRequestPath resolves /../.. to / which hits root dir, not /etc/passwd
    // The file /etc/passwd should never be accessible
    expect(response).not.toContain("root:");
    // Should get a valid HTTP response (either 200 dir listing or 404)
    expect(response).toMatch(/^HTTP\/1\.1 (200|404)/);
  });

  it("handles HEAD request", async () => {
    await fs.writeFile(path.join(tmpDir, "head-test.txt"), "test content");

    const res = await fetch(`http://127.0.0.1:${port}/head-test.txt`, {
      method: "HEAD",
    });
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe("");

    expect(res.headers.get("content-length")).toBe("12");
  });

  it("returns 405 for POST", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("serves JSON with correct content-type", async () => {
    await fs.writeFile(path.join(tmpDir, "data.json"), '{"ok":true}');

    const res = await fetch(`http://127.0.0.1:${port}/data.json`);
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");

    const body = await res.text();
    expect(body).toBe('{"ok":true}');
  });

  it("serves subdirectory files", async () => {
    await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "sub", "nested.txt"),
      "nested content",
    );

    const res = await fetch(`http://127.0.0.1:${port}/sub/nested.txt`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe("nested content");
  });
});

describe("WebServer SPA mode", () => {
  beforeEach(async () => {
    const config = {
      ...defaultConfig(tmpDir),
      port: 0,
      quiet: true,
      spa: true,
    };
    server = createNodeServer({ config });
    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("serves index.html for missing paths in SPA mode", async () => {
    await fs.writeFile(path.join(tmpDir, "index.html"), '<div id="app"></div>');

    const res = await fetch(`http://127.0.0.1:${port}/some/route`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe('<div id="app"></div>');
  });
});

describe("WebServer CORS", () => {
  beforeEach(async () => {
    const config = {
      ...defaultConfig(tmpDir),
      port: 0,
      quiet: true,
      cors: true,
    };
    server = createNodeServer({ config });
    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("includes CORS headers", async () => {
    await fs.writeFile(path.join(tmpDir, "cors.txt"), "test");

    const res = await fetch(`http://127.0.0.1:${port}/cors.txt`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("handles OPTIONS preflight", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/anything`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
