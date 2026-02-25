import type { IFileHandle } from "../interfaces/filesystem.js";
import type { ITcpSocket } from "../interfaces/socket.js";
import { concat, fromString } from "../utils/buffer.js";
import type { HttpResponseOptions } from "./types.js";

/**
 * Send a complete HTTP response (headers + body) over a socket.
 */
export function sendResponse(
  socket: ITcpSocket,
  response: HttpResponseOptions,
): void {
  const headers = normalizeHeaders(response.headers);
  const body = response.body ?? new Uint8Array(0);

  if (!headers.has("content-length")) {
    headers.set("content-length", String(body.length));
  }
  if (!headers.has("connection")) {
    headers.set("connection", "close");
  }

  const headerBytes = buildHeaderBytes(
    response.status,
    response.statusText,
    headers,
  );
  socket.send(concat([headerBytes, body]));
}

/**
 * Send a streaming HTTP response: headers first, then stream file contents in chunks.
 */
export async function sendFileResponse(
  socket: ITcpSocket,
  response: HttpResponseOptions,
  fileHandle: IFileHandle,
  fileSize: number,
): Promise<void> {
  const headers = normalizeHeaders(response.headers);

  if (!headers.has("content-length")) {
    headers.set("content-length", String(fileSize));
  }
  if (!headers.has("connection")) {
    headers.set("connection", "close");
  }

  const headerBytes = buildHeaderBytes(
    response.status,
    response.statusText,
    headers,
  );
  socket.send(headerBytes);

  const CHUNK_SIZE = 64 * 1024; // 64KB chunks
  const buffer = new Uint8Array(CHUNK_SIZE);
  let position = 0;
  let remaining = fileSize;

  while (remaining > 0) {
    const toRead = Math.min(CHUNK_SIZE, remaining);
    const { bytesRead } = await fileHandle.read(buffer, 0, toRead, position);
    if (bytesRead === 0) break;

    socket.send(buffer.subarray(0, bytesRead));
    position += bytesRead;
    remaining -= bytesRead;
  }
}

function buildHeaderBytes(
  status: number,
  statusText: string,
  headers: Map<string, string>,
): Uint8Array {
  const lines: string[] = [`HTTP/1.1 ${status} ${statusText}`];
  for (const [key, value] of headers) {
    lines.push(`${key}: ${value}`);
  }
  lines.push("", ""); // \r\n\r\n
  return fromString(lines.join("\r\n"));
}

function normalizeHeaders(
  headers?: Map<string, string> | Record<string, string>,
): Map<string, string> {
  if (!headers) return new Map();
  if (headers instanceof Map) return new Map(headers);
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    map.set(key.toLowerCase(), value);
  }
  return map;
}
