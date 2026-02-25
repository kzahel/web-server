/**
 * Native file handle for QuickJS/Android.
 *
 * Read-only file handle that delegates to __ok200_file_read.
 */

import type { IFileHandle } from "../../interfaces/filesystem.js";

export class NativeFileHandle implements IFileHandle {
  private closed = false;

  constructor(private readonly path: string) {}

  async read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }> {
    if (this.closed) throw new Error("File handle is closed");

    const result = __ok200_file_read(
      this.path,
      String(position),
      String(length),
    ) as ArrayBuffer | null;

    if (!result || result.byteLength === 0) {
      return { bytesRead: 0 };
    }

    const data = new Uint8Array(result);
    const bytesRead = Math.min(data.length, length);
    buffer.set(data.subarray(0, bytesRead), offset);
    return { bytesRead };
  }

  async write(
    _buffer: Uint8Array,
    _offset: number,
    _length: number,
    _position: number,
  ): Promise<{ bytesWritten: number }> {
    throw new Error("Write not supported (read-only serving)");
  }

  async truncate(_len: number): Promise<void> {
    throw new Error("Truncate not supported (read-only serving)");
  }

  async sync(): Promise<void> {
    // No-op for read-only
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
