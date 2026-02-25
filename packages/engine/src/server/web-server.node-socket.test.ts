import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../config/server-config.js";
import { createNodeServer } from "../presets/node.js";

const itSocket = process.env.OK200_SOCKET_TESTS === "1" ? it : it.skip;

let tmpDir: string | null = null;

afterAll(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

describe("WebServer Node adapter (real socket)", () => {
  itSocket(
    "binds to an ephemeral port and serves a request",
    async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ok200-node-socket-"));
      await fs.writeFile(path.join(tmpDir, "hello.txt"), "hello");

      const server = createNodeServer({
        config: {
          ...defaultConfig(tmpDir),
          port: 0,
          quiet: true,
        },
      });

      const port = await server.start();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/hello.txt`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("hello");
      } finally {
        await server.stop();
      }
    },
    10000,
  );
});
