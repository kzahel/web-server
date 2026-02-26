/**
 * Tauri filesystem adapter.
 *
 * Implements IFileSystem and IFileHandle using Tauri invoke commands.
 * File reads use tauri::ipc::Response for raw binary (no base64).
 * File writes use raw invoke body with metadata in headers.
 */

import type {
  IFileHandle,
  IFileStat,
  IFileSystem,
} from "../../interfaces/filesystem.js";
import type { TauriInvokeFn } from "./types.js";

export class TauriFileHandle implements IFileHandle {
  private closed = false;

  constructor(
    private readonly handleId: number,
    private readonly invoke: TauriInvokeFn,
  ) {}

  async read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }> {
    if (this.closed) throw new Error("File handle is closed");

    // Returns raw ArrayBuffer via tauri::ipc::Response
    const result = await this.invoke<ArrayBuffer>("fs_read", {
      handleId: this.handleId,
      length,
      position,
    });

    if (!result || (result as ArrayBuffer).byteLength === 0) {
      return { bytesRead: 0 };
    }

    const data = new Uint8Array(result as ArrayBuffer);
    const bytesRead = Math.min(data.length, length);
    buffer.set(data.subarray(0, bytesRead), offset);
    return { bytesRead };
  }

  async write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesWritten: number }> {
    if (this.closed) throw new Error("File handle is closed");

    const chunk = buffer.subarray(offset, offset + length);
    const bytesWritten = await this.invoke<number>(
      "fs_write",
      chunk.buffer as ArrayBuffer,
      {
        headers: {
          "x-handle-id": String(this.handleId),
          "x-position": String(position),
        },
      },
    );

    return { bytesWritten };
  }

  async truncate(len: number): Promise<void> {
    if (this.closed) throw new Error("File handle is closed");
    await this.invoke("fs_truncate", {
      handleId: this.handleId,
      length: len,
    });
  }

  async sync(): Promise<void> {
    if (this.closed) throw new Error("File handle is closed");
    await this.invoke("fs_sync", { handleId: this.handleId });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.invoke("fs_close", { handleId: this.handleId });
  }
}

export class TauriFileSystem implements IFileSystem {
  constructor(private readonly invoke: TauriInvokeFn) {}

  async open(path: string, mode: "r" | "w" | "r+"): Promise<IFileHandle> {
    const handleId = await this.invoke<number>("fs_open", { path, mode });
    return new TauriFileHandle(handleId, this.invoke);
  }

  async stat(path: string): Promise<IFileStat> {
    const raw = (await this.invoke("fs_stat", { path })) as {
      size: number;
      mtime_ms: number;
      is_directory: boolean;
      is_file: boolean;
    };
    return {
      size: raw.size,
      mtime: new Date(raw.mtime_ms),
      isDirectory: raw.is_directory,
      isFile: raw.is_file,
    };
  }

  async mkdir(path: string): Promise<void> {
    await this.invoke("fs_mkdir", { path });
  }

  async exists(path: string): Promise<boolean> {
    return this.invoke<boolean>("fs_exists", { path });
  }

  async readdir(path: string): Promise<string[]> {
    return this.invoke<string[]>("fs_readdir", { path });
  }

  async delete(path: string): Promise<void> {
    await this.invoke("fs_delete", { path });
  }

  async realpath(path: string): Promise<string> {
    return this.invoke<string>("fs_realpath", { path });
  }

  async listTree(path: string): Promise<Array<{ path: string; size: number }>> {
    return this.invoke<Array<{ path: string; size: number }>>("fs_list_tree", {
      path,
    });
  }
}
