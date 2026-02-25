import { describe, expect, it, vi } from "vitest";
import type { IFileHandle } from "../interfaces/filesystem.js";
import type { ITcpSocket } from "../interfaces/socket.js";
import { decodeToString } from "../utils/buffer.js";
import { sendFileResponse } from "./response-writer.js";

class InMemoryFileHandle implements IFileHandle {
  constructor(private readonly data: Uint8Array) {}

  async read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }> {
    const available = Math.max(0, this.data.length - position);
    const bytesRead = Math.min(length, available);
    if (bytesRead > 0) {
      buffer.set(this.data.subarray(position, position + bytesRead), offset);
    }
    return { bytesRead };
  }

  async write(): Promise<{ bytesWritten: number }> {
    return { bytesWritten: 0 };
  }

  async truncate(): Promise<void> {}

  async sync(): Promise<void> {}

  async close(): Promise<void> {}
}

function createData(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 251;
  }
  return data;
}

describe("sendFileResponse", () => {
  it("awaits backpressure-aware writes sequentially", async () => {
    const fileData = createData(150_000); // multiple chunks
    const handle = new InMemoryFileHandle(fileData);

    const chunks: Uint8Array[] = [];
    let inflight = 0;
    let maxInflight = 0;

    const socket: ITcpSocket = {
      send: vi.fn(),
      sendAndWait: vi.fn(async (data: Uint8Array) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        chunks.push(data.slice());
        inflight--;
      }),
      onData() {},
      onClose() {},
      onError() {},
      close() {},
    };

    await sendFileResponse(
      socket,
      { status: 200, statusText: "OK" },
      handle,
      fileData.length,
    );

    expect(socket.sendAndWait).toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
    expect(maxInflight).toBe(1);
    expect(chunks.length).toBeGreaterThan(2); // headers + at least two body chunks
    expect(decodeToString(chunks[0])).toContain("HTTP/1.1 200 OK");
  });

  it("falls back to plain send when sendAndWait is unavailable", async () => {
    const fileData = createData(10_000);
    const handle = new InMemoryFileHandle(fileData);
    const sent: Uint8Array[] = [];

    const socket: ITcpSocket = {
      send(data: Uint8Array) {
        sent.push(data.slice());
      },
      onData() {},
      onClose() {},
      onError() {},
      close() {},
    };

    await sendFileResponse(
      socket,
      { status: 200, statusText: "OK" },
      handle,
      fileData.length,
    );

    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(decodeToString(sent[0])).toContain("HTTP/1.1 200 OK");
  });
});
