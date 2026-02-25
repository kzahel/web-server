import { describe, expect, it } from "vitest";
import type { ITcpSocket } from "../interfaces/socket.js";
import { fromString } from "../utils/buffer.js";
import { createHttpRequestParser, parseHttpRequest } from "./request-parser.js";

/** Create a mock socket that delivers data and then closes */
function mockSocket(rawRequest: string): ITcpSocket {
  let dataCallback: ((data: Uint8Array) => void) | null = null;
  let closeCallback: ((hadError: boolean) => void) | null = null;

  return {
    send() {},
    onData(cb) {
      dataCallback = cb;
      // Deliver data on next tick
      queueMicrotask(() => {
        dataCallback?.(fromString(rawRequest));
      });
    },
    onClose(cb) {
      closeCallback = cb;
      // Close after data is delivered
      queueMicrotask(() => {
        queueMicrotask(() => {
          closeCallback?.(false);
        });
      });
    },
    onError() {},
    close() {},
  };
}

/** Create a mock socket that delivers data in multiple chunks */
function chunkedMockSocket(chunks: string[]): ITcpSocket {
  let dataCallback: ((data: Uint8Array) => void) | null = null;
  let closeCallback: ((hadError: boolean) => void) | null = null;

  return {
    send() {},
    onData(cb) {
      dataCallback = cb;
      let delay = 0;
      for (const chunk of chunks) {
        const c = chunk;
        setTimeout(() => dataCallback?.(fromString(c)), delay);
        delay += 5;
      }
    },
    onClose(cb) {
      closeCallback = cb;
      setTimeout(() => closeCallback?.(false), chunks.length * 5 + 10);
    },
    onError() {},
    close() {},
  };
}

describe("parseHttpRequest", () => {
  it("parses a simple GET request", async () => {
    const socket = mockSocket(
      "GET /index.html HTTP/1.1\r\nHost: localhost\r\n\r\n",
    );
    const req = await parseHttpRequest(socket);

    expect(req.method).toBe("GET");
    expect(req.url).toBe("/index.html");
    expect(req.httpVersion).toBe("1.1");
    expect(req.headers.get("host")).toBe("localhost");
    expect(req.body).toBeUndefined();
  });

  it("parses request with multiple headers", async () => {
    const raw = [
      "GET /api/data HTTP/1.1",
      "Host: example.com",
      "Accept: application/json",
      "User-Agent: test/1.0",
      "",
      "",
    ].join("\r\n");

    const socket = mockSocket(raw);
    const req = await parseHttpRequest(socket);

    expect(req.method).toBe("GET");
    expect(req.url).toBe("/api/data");
    expect(req.headers.get("host")).toBe("example.com");
    expect(req.headers.get("accept")).toBe("application/json");
    expect(req.headers.get("user-agent")).toBe("test/1.0");
  });

  it("parses POST request with body", async () => {
    const body = '{"key":"value"}';
    const raw = [
      "POST /submit HTTP/1.1",
      "Host: localhost",
      `Content-Length: ${body.length}`,
      "Content-Type: application/json",
      "",
      body,
    ].join("\r\n");

    const socket = mockSocket(raw);
    const req = await parseHttpRequest(socket);

    expect(req.method).toBe("POST");
    expect(req.url).toBe("/submit");
    expect(req.body).toBeDefined();
    expect(new TextDecoder().decode(req.body)).toBe(body);
  });

  it("handles chunked delivery", async () => {
    const socket = chunkedMockSocket([
      "GET /file.txt",
      " HTTP/1.1\r\nHost: loc",
      "alhost\r\n\r\n",
    ]);

    const req = await parseHttpRequest(socket);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("/file.txt");
  });

  it("parses HEAD request", async () => {
    const socket = mockSocket("HEAD / HTTP/1.1\r\nHost: localhost\r\n\r\n");
    const req = await parseHttpRequest(socket);

    expect(req.method).toBe("HEAD");
    expect(req.url).toBe("/");
  });

  it("parses multiple requests from one persistent socket", async () => {
    const socket = chunkedMockSocket([
      "GET /one HTTP/1.1\r\nHost: localhost\r\n\r\nGET /two HTTP/1.1\r\nHost: localhost\r\n\r\n",
    ]);
    const parser = createHttpRequestParser(socket);

    const first = await parser.readRequest();
    const second = await parser.readRequest();

    expect(first.method).toBe("GET");
    expect(first.url).toBe("/one");
    expect(second.method).toBe("GET");
    expect(second.url).toBe("/two");
  });

  it("times out incomplete requests", async () => {
    const socket: ITcpSocket = {
      send() {},
      onData() {},
      onClose() {},
      onError() {},
      close() {},
    };

    await expect(
      parseHttpRequest(socket, { timeoutMs: 20 }),
    ).rejects.toMatchObject({
      code: "IDLE_TIMEOUT",
    });
  });
});
