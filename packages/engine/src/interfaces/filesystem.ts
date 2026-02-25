/**
 * Abstract File System Interfaces
 *
 * Extracted from jstorrent. Decouples file operations from any
 * specific runtime so the same server engine can run everywhere.
 */

export interface IFileStat {
  size: number
  mtime: Date
  isDirectory: boolean
  isFile: boolean
}

export interface IFileHandle {
  /** Read data from the file at a specific position. */
  read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }>

  /** Write data to the file at a specific position. */
  write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesWritten: number }>

  /** Truncate the file to a specific size. */
  truncate(len: number): Promise<void>

  /** Flush changes to storage. */
  sync(): Promise<void>

  /** Close the file handle. */
  close(): Promise<void>
}

export interface IFileSystem {
  /** Open a file. */
  open(path: string, mode: 'r' | 'w' | 'r+'): Promise<IFileHandle>

  /** Get file statistics. */
  stat(path: string): Promise<IFileStat>

  /** Create a directory. */
  mkdir(path: string): Promise<void>

  /** Check if a path exists. */
  exists(path: string): Promise<boolean>

  /** Read directory contents. Returns list of filenames (not full paths). */
  readdir(path: string): Promise<string[]>

  /** Delete a file or directory. */
  delete(path: string): Promise<void>

  /**
   * Recursively list all files under a directory with their sizes.
   * Returns paths relative to the given path.
   */
  listTree(path: string): Promise<Array<{ path: string; size: number }>>
}
