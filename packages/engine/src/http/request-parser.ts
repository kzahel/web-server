import type { ITcpSocket } from "../interfaces/socket.js";
import { concat, decodeToString } from "../utils/buffer.js";
import type { HttpRequest } from "./types.js";

const CRLF_CRLF = new Uint8Array([13, 10, 13, 10]); // \r\n\r\n
const DEFAULT_MAX_HEADER_SIZE = 8 * 1024; // 8KB
const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

export interface ParseHttpRequestOptions {
  maxHeaderSize?: number;
  maxBodySize?: number;
  timeoutMs?: number;
}

export interface HttpRequestHead {
  method: string;
  url: string;
  httpVersion: string;
  headers: Map<string, string>;
  contentLength: number;
}

export type HttpRequestParseErrorCode =
  | "IDLE_TIMEOUT"
  | "REQUEST_TIMEOUT"
  | "CONNECTION_CLOSED"
  | "CONNECTION_CLOSED_INCOMPLETE"
  | "HEADERS_TOO_LARGE"
  | "MALFORMED_REQUEST_LINE"
  | "INVALID_CONTENT_LENGTH"
  | "BODY_TOO_LARGE";

export class HttpRequestParseError extends Error {
  constructor(
    readonly code: HttpRequestParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestParseError";
  }
}

interface ParsedRequestHeadResult {
  head: HttpRequestHead;
  bytesConsumed: number;
}

function findSequence(buffer: Uint8Array, sequence: Uint8Array): number {
  outer: for (let i = 0; i <= buffer.length - sequence.length; i++) {
    for (let j = 0; j < sequence.length; j++) {
      if (buffer[i + j] !== sequence[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function tryParseRequestHeadFromBuffer(
  buffer: Uint8Array,
  maxHeaderSize: number,
): ParsedRequestHeadResult | null {
  const separatorIndex = findSequence(buffer, CRLF_CRLF);
  if (separatorIndex === -1) {
    if (buffer.length > maxHeaderSize) {
      throw new HttpRequestParseError(
        "HEADERS_TOO_LARGE",
        "Request headers too large",
      );
    }
    return null;
  }

  if (separatorIndex > maxHeaderSize) {
    throw new HttpRequestParseError(
      "HEADERS_TOO_LARGE",
      "Request headers too large",
    );
  }

  const headerString = decodeToString(buffer.subarray(0, separatorIndex));
  const lines = headerString.split("\r\n");
  const requestLine = lines[0] ?? "";
  const requestLineParts = requestLine.trim().split(/\s+/);
  if (requestLineParts.length < 3) {
    throw new HttpRequestParseError(
      "MALFORMED_REQUEST_LINE",
      "Malformed request line",
    );
  }

  const [method, url, rawVersion] = requestLineParts;
  const httpVersion = rawVersion.startsWith("HTTP/")
    ? rawVersion.slice("HTTP/".length)
    : rawVersion;

  const headers = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(":");
    if (colonIdx === -1) continue;
    const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
    const value = lines[i].substring(colonIdx + 1).trim();
    headers.set(key, value);
  }

  const clHeader = headers.get("content-length");
  const contentLength = clHeader ? Number.parseInt(clHeader, 10) : 0;
  if (Number.isNaN(contentLength) || contentLength < 0) {
    throw new HttpRequestParseError(
      "INVALID_CONTENT_LENGTH",
      "Invalid Content-Length",
    );
  }

  return {
    head: { method, url, httpVersion, headers, contentLength },
    bytesConsumed: separatorIndex + CRLF_CRLF.length,
  };
}

export class HttpRequestStreamParser {
  private buffer: Uint8Array = new Uint8Array(0);
  private closed = false;
  private socketError: Error | null = null;
  private waiters: Array<() => void> = [];

  constructor(socket: ITcpSocket) {
    socket.onData((data) => {
      this.buffer = concat([this.buffer, data]);
      this.notifyWaiters();
    });

    socket.onClose(() => {
      this.closed = true;
      this.notifyWaiters();
    });

    socket.onError((err) => {
      this.socketError = err;
      this.closed = true;
      this.notifyWaiters();
    });
  }

  async readRequest(options?: ParseHttpRequestOptions): Promise<HttpRequest> {
    const head = await this.readRequestHead(options);
    const body =
      head.contentLength > 0
        ? await this.readBody(head.contentLength, options)
        : undefined;

    return {
      method: head.method,
      url: head.url,
      httpVersion: head.httpVersion,
      headers: head.headers,
      body,
    };
  }

  async readRequestHead(
    options?: ParseHttpRequestOptions,
  ): Promise<HttpRequestHead> {
    const maxHeaderSize = options?.maxHeaderSize ?? DEFAULT_MAX_HEADER_SIZE;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const parsed = tryParseRequestHeadFromBuffer(this.buffer, maxHeaderSize);
      if (parsed) {
        this.buffer = this.buffer.slice(parsed.bytesConsumed);
        return parsed.head;
      }

      if (this.socketError) {
        throw this.socketError;
      }

      if (this.closed) {
        if (this.buffer.length === 0) {
          throw new HttpRequestParseError(
            "CONNECTION_CLOSED",
            "Connection closed",
          );
        }

        throw new HttpRequestParseError(
          "CONNECTION_CLOSED_INCOMPLETE",
          "Connection closed before request was complete",
        );
      }

      const hadActivity = await this.waitForActivity(deadline - Date.now());
      if (!hadActivity) {
        if (this.buffer.length === 0) {
          throw new HttpRequestParseError(
            "IDLE_TIMEOUT",
            "Connection idle timed out",
          );
        }

        throw new HttpRequestParseError(
          "REQUEST_TIMEOUT",
          "Request timed out before completion",
        );
      }
    }
  }

  async readBody(
    contentLength: number,
    options?: ParseHttpRequestOptions,
  ): Promise<Uint8Array> {
    if (contentLength <= 0) {
      return new Uint8Array(0);
    }

    const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
    if (contentLength > maxBodySize) {
      throw new HttpRequestParseError(
        "BODY_TOO_LARGE",
        "Request body too large",
      );
    }

    const body = new Uint8Array(contentLength);
    let position = 0;

    await this.consumeBody(
      contentLength,
      async (chunk) => {
        body.set(chunk, position);
        position += chunk.length;
      },
      options,
    );

    return body;
  }

  async consumeBody(
    contentLength: number,
    onChunk: (chunk: Uint8Array) => Promise<void> | void,
    options?: ParseHttpRequestOptions,
  ): Promise<void> {
    if (contentLength <= 0) {
      return;
    }

    const maxBodySize = options?.maxBodySize;
    if (typeof maxBodySize === "number" && contentLength > maxBodySize) {
      throw new HttpRequestParseError(
        "BODY_TOO_LARGE",
        "Request body too large",
      );
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    let remaining = contentLength;

    while (remaining > 0) {
      if (this.buffer.length > 0) {
        const take = Math.min(remaining, this.buffer.length);
        const chunk = this.buffer.slice(0, take);
        this.buffer = this.buffer.slice(take);
        remaining -= take;
        await onChunk(chunk);
        continue;
      }

      if (this.socketError) {
        throw this.socketError;
      }

      if (this.closed) {
        throw new HttpRequestParseError(
          "CONNECTION_CLOSED_INCOMPLETE",
          "Connection closed before request was complete",
        );
      }

      const hadActivity = await this.waitForActivity(deadline - Date.now());
      if (!hadActivity) {
        throw new HttpRequestParseError(
          "REQUEST_TIMEOUT",
          "Request timed out before completion",
        );
      }
    }
  }

  private waitForActivity(timeoutMs: number): Promise<boolean> {
    if (timeoutMs <= 0) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;

      const onActivity = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.waiters = this.waiters.filter((waiter) => waiter !== onActivity);
        resolve(false);
      }, timeoutMs);

      this.waiters.push(onActivity);
    });
  }

  private notifyWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }
}

export function createHttpRequestParser(
  socket: ITcpSocket,
): HttpRequestStreamParser {
  return new HttpRequestStreamParser(socket);
}

/**
 * Parse a single HTTP/1.1 request from a TCP socket stream.
 * Returns a promise that resolves with the parsed request.
 */
export function parseHttpRequest(
  socket: ITcpSocket,
  options?: ParseHttpRequestOptions,
): Promise<HttpRequest> {
  return createHttpRequestParser(socket).readRequest(options);
}
