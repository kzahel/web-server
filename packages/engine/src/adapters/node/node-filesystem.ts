import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  IFileHandle,
  IFileStat,
  IFileSystem,
} from "../../interfaces/filesystem.js";

export class NodeFileHandle implements IFileHandle {
  constructor(private handle: fs.FileHandle) {}

  async read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }> {
    const result = await this.handle.read(buffer, offset, length, position);
    return { bytesRead: result.bytesRead };
  }

  async write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesWritten: number }> {
    const result = await this.handle.write(buffer, offset, length, position);
    return { bytesWritten: result.bytesWritten };
  }

  async truncate(len: number): Promise<void> {
    await this.handle.truncate(len);
  }

  async sync(): Promise<void> {
    await this.handle.sync();
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

export class NodeFileSystem implements IFileSystem {
  async open(filePath: string, mode: "r" | "w" | "r+"): Promise<IFileHandle> {
    let flags = "r";
    if (mode === "w") flags = "w+";
    if (mode === "r+") flags = "r+";

    if (mode !== "r") {
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      if (mode === "r+") {
        try {
          await fs.access(filePath);
        } catch {
          const handle = await fs.open(filePath, "w");
          await handle.close();
        }
      }
    }

    const handle = await fs.open(filePath, flags);
    return new NodeFileHandle(handle);
  }

  async stat(filePath: string): Promise<IFileStat> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
    };
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  async delete(filePath: string): Promise<void> {
    await fs.rm(filePath, { recursive: true, force: true });
  }

  async realpath(filePath: string): Promise<string> {
    return fs.realpath(filePath);
  }

  async listTree(
    dirPath: string,
  ): Promise<Array<{ path: string; size: number }>> {
    const results: Array<{ path: string; size: number }> = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const fullPath = path.join(dir, name);
        const relative = prefix ? `${prefix}/${name}` : name;
        try {
          const stats = await fs.stat(fullPath);
          if (stats.isDirectory()) {
            await walk(fullPath, relative);
          } else if (stats.isFile()) {
            results.push({ path: relative, size: stats.size });
          }
        } catch {
          // Skip entries that can't be stat'd
        }
      }
    };
    await walk(dirPath, "");
    return results;
  }
}
