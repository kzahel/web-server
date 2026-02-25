import type {
  IFileHandle,
  IFileStat,
  IFileSystem,
} from "../interfaces/filesystem.js";

interface MemoryFileEntry {
  data: Uint8Array;
  mtimeMs: number;
}

class InMemoryFileHandle implements IFileHandle {
  private closed = false;

  constructor(
    private readonly fileSystem: InMemoryFileSystem,
    private readonly filePath: string,
  ) {}

  async read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }> {
    this.ensureOpen();
    const file = this.fileSystem.getFileOrThrow(this.filePath);

    const end = Math.min(position + length, file.data.length);
    const bytesRead = Math.max(0, end - position);
    if (bytesRead === 0) {
      return { bytesRead: 0 };
    }

    buffer.set(file.data.subarray(position, end), offset);
    return { bytesRead };
  }

  async write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesWritten: number }> {
    this.ensureOpen();

    let file = this.fileSystem.getFileOrThrow(this.filePath);
    const requiredLength = position + length;
    if (requiredLength > file.data.length) {
      const expanded = new Uint8Array(requiredLength);
      expanded.set(file.data, 0);
      file = this.fileSystem.setFile(this.filePath, expanded);
    }

    const chunk = buffer.subarray(offset, offset + length);
    file.data.set(chunk, position);
    this.fileSystem.touch(this.filePath);

    return { bytesWritten: chunk.length };
  }

  async truncate(len: number): Promise<void> {
    this.ensureOpen();
    const file = this.fileSystem.getFileOrThrow(this.filePath);
    if (len === file.data.length) {
      this.fileSystem.touch(this.filePath);
      return;
    }

    const next = new Uint8Array(len);
    next.set(file.data.subarray(0, Math.min(len, file.data.length)), 0);
    this.fileSystem.setFile(this.filePath, next);
  }

  async sync(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("File handle is closed");
    }
  }
}

export class InMemoryFileSystem implements IFileSystem {
  private readonly files = new Map<string, MemoryFileEntry>();
  private readonly directories = new Map<string, number>([["/", Date.now()]]);

  async open(path: string, mode: "r" | "w" | "r+"): Promise<IFileHandle> {
    const normalized = normalizePath(path);

    if (this.directories.has(normalized)) {
      throw new Error(`EISDIR: cannot open directory as file: ${normalized}`);
    }

    if (mode === "r") {
      this.getFileOrThrow(normalized);
      return new InMemoryFileHandle(this, normalized);
    }

    this.ensureParentDirectories(normalized);

    if (mode === "w") {
      this.setFile(normalized, new Uint8Array(0));
      return new InMemoryFileHandle(this, normalized);
    }

    if (!this.files.has(normalized)) {
      this.setFile(normalized, new Uint8Array(0));
    } else {
      this.touch(normalized);
    }

    return new InMemoryFileHandle(this, normalized);
  }

  async stat(path: string): Promise<IFileStat> {
    const normalized = normalizePath(path);

    const file = this.files.get(normalized);
    if (file) {
      return {
        size: file.data.length,
        mtime: new Date(file.mtimeMs),
        isDirectory: false,
        isFile: true,
      };
    }

    const dirMtimeMs = this.directories.get(normalized);
    if (dirMtimeMs !== undefined) {
      return {
        size: 0,
        mtime: new Date(dirMtimeMs),
        isDirectory: true,
        isFile: false,
      };
    }

    throw new Error(`ENOENT: no such file or directory: ${normalized}`);
  }

  async mkdir(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (this.files.has(normalized)) {
      throw new Error(`EEXIST: file exists at path: ${normalized}`);
    }

    const segments = normalized === "/" ? [] : normalized.slice(1).split("/");
    let current = "/";
    for (const segment of segments) {
      current = current === "/" ? `/${segment}` : `${current}/${segment}`;
      if (!this.files.has(current)) {
        this.directories.set(current, Date.now());
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    return this.files.has(normalized) || this.directories.has(normalized);
  }

  async readdir(path: string): Promise<string[]> {
    const normalized = normalizePath(path);
    if (!this.directories.has(normalized)) {
      throw new Error(`ENOENT: directory does not exist: ${normalized}`);
    }

    const entries = new Set<string>();
    const prefix = normalized === "/" ? "/" : `${normalized}/`;

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      const first = relative.split("/")[0];
      if (first) entries.add(first);
    }

    for (const dirPath of this.directories.keys()) {
      if (dirPath === normalized || !dirPath.startsWith(prefix)) continue;
      const relative = dirPath.slice(prefix.length);
      const first = relative.split("/")[0];
      if (first) entries.add(first);
    }

    return Array.from(entries);
  }

  async delete(path: string): Promise<void> {
    const normalized = normalizePath(path);

    if (this.files.delete(normalized)) {
      return;
    }

    if (!this.directories.has(normalized)) {
      return;
    }

    const prefix = normalized === "/" ? "/" : `${normalized}/`;

    for (const filePath of Array.from(this.files.keys())) {
      if (filePath.startsWith(prefix)) {
        this.files.delete(filePath);
      }
    }

    for (const dirPath of Array.from(this.directories.keys())) {
      if (dirPath === "/") continue;
      if (dirPath === normalized || dirPath.startsWith(prefix)) {
        this.directories.delete(dirPath);
      }
    }
  }

  async realpath(path: string): Promise<string> {
    const normalized = normalizePath(path);
    if (!this.files.has(normalized) && !this.directories.has(normalized)) {
      throw new Error(`ENOENT: no such file or directory: ${normalized}`);
    }
    return normalized;
  }

  async listTree(path: string): Promise<Array<{ path: string; size: number }>> {
    const normalized = normalizePath(path);
    if (!this.directories.has(normalized)) {
      return [];
    }

    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    const out: Array<{ path: string; size: number }> = [];

    for (const [filePath, file] of this.files) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      if (relative) {
        out.push({ path: relative, size: file.data.length });
      }
    }

    return out;
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const handle = await this.open(path, "w");
    await handle.write(data, 0, data.length, 0);
    await handle.close();
  }

  async readFile(path: string): Promise<Uint8Array> {
    const file = this.getFileOrThrow(normalizePath(path));
    return file.data.slice();
  }

  getFileOrThrow(path: string): MemoryFileEntry {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`ENOENT: file does not exist: ${path}`);
    }
    return file;
  }

  setFile(path: string, data: Uint8Array): MemoryFileEntry {
    const entry: MemoryFileEntry = { data, mtimeMs: Date.now() };
    this.files.set(path, entry);
    this.directories.set(parentDirectory(path), Date.now());
    return entry;
  }

  touch(path: string): void {
    const file = this.getFileOrThrow(path);
    file.mtimeMs = Date.now();
  }

  private ensureParentDirectories(path: string): void {
    const parent = parentDirectory(path);
    this.ensureDirectory(parent);
  }

  private ensureDirectory(path: string): void {
    if (this.directories.has(path)) {
      return;
    }

    const segments = path === "/" ? [] : path.slice(1).split("/");
    let current = "/";
    for (const segment of segments) {
      current = current === "/" ? `/${segment}` : `${current}/${segment}`;
      if (this.files.has(current)) {
        throw new Error(
          `ENOTDIR: file exists where directory expected: ${current}`,
        );
      }
      if (!this.directories.has(current)) {
        this.directories.set(current, Date.now());
      }
    }
  }
}

function normalizePath(path: string): string {
  const slashNormalized = path.replace(/\\/g, "/");
  const withRoot = slashNormalized.startsWith("/")
    ? slashNormalized
    : `/${slashNormalized}`;

  const parts = withRoot.split("/");
  const output: string[] = [];

  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }

  return output.length === 0 ? "/" : `/${output.join("/")}`;
}

function parentDirectory(path: string): string {
  if (path === "/") {
    return "/";
  }
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}
