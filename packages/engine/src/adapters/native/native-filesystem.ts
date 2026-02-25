/**
 * Native filesystem adapter for QuickJS/Android.
 *
 * IMPORTANT: QuickJS FFI returns booleans as strings.
 * Always use === 'true', never truthiness checks.
 */

import type {
  IFileHandle,
  IFileStat,
  IFileSystem,
} from "../../interfaces/filesystem.js";
import { NativeFileHandle } from "./native-file-handle.js";

export class NativeFileSystem implements IFileSystem {
  async open(path: string, mode: "r" | "w" | "r+"): Promise<IFileHandle> {
    if (mode !== "r") {
      throw new Error("Only read mode is supported on Android");
    }
    return new NativeFileHandle(path);
  }

  async stat(path: string): Promise<IFileStat> {
    const result = __ok200_file_stat(path);
    if (!result) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }
    const parsed = JSON.parse(result) as {
      size: number;
      mtime: number;
      isDirectory: boolean;
      isFile: boolean;
    };
    return {
      size: parsed.size,
      mtime: new Date(parsed.mtime),
      isDirectory: parsed.isDirectory,
      isFile: parsed.isFile,
    };
  }

  async mkdir(_path: string): Promise<void> {
    throw new Error("mkdir not supported on Android (read-only serving)");
  }

  async exists(path: string): Promise<boolean> {
    const result = __ok200_file_exists(path);
    return result === "true";
  }

  async readdir(path: string): Promise<string[]> {
    const result = __ok200_file_readdir(path);
    if (!result) {
      throw new Error(`ENOENT: no such file or directory, readdir '${path}'`);
    }
    return JSON.parse(result) as string[];
  }

  async delete(_path: string): Promise<void> {
    throw new Error("delete not supported on Android (read-only serving)");
  }

  async realpath(path: string): Promise<string> {
    const result = __ok200_file_realpath(path);
    if (!result) {
      throw new Error(`ENOENT: no such file or directory, realpath '${path}'`);
    }
    return result;
  }

  async listTree(path: string): Promise<Array<{ path: string; size: number }>> {
    const result = __ok200_file_list_tree(path);
    return JSON.parse(result) as Array<{ path: string; size: number }>;
  }
}
