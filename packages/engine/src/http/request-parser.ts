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

function findSequence(buffer: Uint8Array, sequence: Uint8Array): number {
  outer: for (let i = 0; i <= buffer.length - sequence.length; i++) {
    for (let j = 0; j < sequence.length; j++) {
      if (buffer[i + j] !== sequence[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Parse a single HTTP/1.1 request from a TCP socket stream.
 * Returns a promise that resolves with the parsed request.
 */
export function parseHttpRequest(
  socket: ITcpSocket,
  options?: ParseHttpRequestOptions,
): Promise<HttpRequest> {
  return new Promise((resolve, reject) => {
    const maxHeaderSize = options?.maxHeaderSize ?? DEFAULT_MAX_HEADER_SIZE;
    const maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    let buffer: Uint8Array = new Uint8Array(0);
    let headersParsed = false;
    let method = "";
    let url = "";
    let httpVersion = "";
    let headers: Map<string, string> = new Map();
    let contentLength = 0;
    let bodyStart = 0;
    let resolved = false;
    const timeout = setTimeout(() => {
      fail(new Error("Request timed out before completion"));
    }, timeoutMs);

    const done = (result: HttpRequest) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(result);
      }
    };

    const fail = (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    };

    const processBuffer = () => {
      if (!headersParsed) {
        if (buffer.length > maxHeaderSize) {
          fail(new Error("Request headers too large"));
          return;
        }

        const separatorIndex = findSequence(buffer, CRLF_CRLF);
        if (separatorIndex === -1) return; // Need more data

        const headerString = decodeToString(buffer.subarray(0, separatorIndex));
        bodyStart = separatorIndex + 4;

        const lines = headerString.split("\r\n");
        const requestLine = lines[0];
        const parts = requestLine.split(" ");
        if (parts.length < 3) {
          fail(new Error("Malformed request line"));
          return;
        }

        method = parts[0];
        url = parts[1];
        httpVersion = parts[2].replace("HTTP/", "");

        headers = new Map();
        for (let i = 1; i < lines.length; i++) {
          const colonIdx = lines[i].indexOf(":");
          if (colonIdx === -1) continue;
          const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
          const value = lines[i].substring(colonIdx + 1).trim();
          headers.set(key, value);
        }

        const clHeader = headers.get("content-length");
        contentLength = clHeader ? parseInt(clHeader, 10) : 0;
        if (Number.isNaN(contentLength) || contentLength < 0) {
          fail(new Error("Invalid Content-Length"));
          return;
        }
        if (contentLength > maxBodySize) {
          fail(new Error("Request body too large"));
          return;
        }

        headersParsed = true;
      }

      if (headersParsed) {
        const bodyReceived = buffer.length - bodyStart;
        if (bodyReceived >= contentLength) {
          const body =
            contentLength > 0
              ? buffer.slice(bodyStart, bodyStart + contentLength)
              : undefined;
          done({ method, url, httpVersion, headers, body });
        }
      }
    };

    socket.onData((data) => {
      buffer = concat([buffer, data]);
      processBuffer();
    });

    socket.onClose(() => {
      if (!resolved) {
        fail(new Error("Connection closed before request was complete"));
      }
    });

    socket.onError((err) => {
      fail(err);
    });
  });
}
