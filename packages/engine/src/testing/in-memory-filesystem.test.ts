import { describe, expect, it } from "vitest";
import { concat, decodeToString, fromString } from "../utils/buffer.js";
import { InMemoryFileSystem } from "./in-memory-filesystem.js";

async function readAll(
  fs: InMemoryFileSystem,
  path: string,
): Promise<Uint8Array> {
  const stat = await fs.stat(path);
  const handle = await fs.open(path, "r");
  const buffer = new Uint8Array(stat.size);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
  await handle.close();
  return buffer.subarray(0, bytesRead);
}

describe("InMemoryFileSystem", () => {
  it("supports chunked positional writes for streaming uploads", async () => {
    const fs = new InMemoryFileSystem();
    await fs.mkdir("/uploads");

    const handle = await fs.open("/uploads/video.bin", "w");

    const chunkA = fromString("hello ");
    const chunkB = fromString("streaming ");
    const chunkC = fromString("upload");

    let position = 0;
    await handle.write(chunkA, 0, chunkA.length, position);
    position += chunkA.length;
    await handle.write(chunkB, 0, chunkB.length, position);
    position += chunkB.length;
    await handle.write(chunkC, 0, chunkC.length, position);
    await handle.close();

    const file = await readAll(fs, "/uploads/video.bin");
    expect(decodeToString(file)).toBe("hello streaming upload");
    expect((await fs.stat("/uploads/video.bin")).size).toBe(file.length);
  });

  it("zero-fills unwritten gaps when writing at later positions", async () => {
    const fs = new InMemoryFileSystem();
    const handle = await fs.open("/sparse.bin", "w");

    const tail = fromString("tail");
    await handle.write(tail, 0, tail.length, 8);
    await handle.close();

    const bytes = await readAll(fs, "/sparse.bin");
    expect(bytes.length).toBe(12);
    expect(Array.from(bytes.subarray(0, 8))).toEqual(new Array(8).fill(0));
    expect(decodeToString(bytes.subarray(8))).toBe("tail");
  });

  it("normalizes paths and lists files recursively", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/root/a.txt", fromString("a"));
    await fs.writeFile("/root/sub/b.txt", fromString("bb"));

    expect(await fs.realpath("/root/./sub/../a.txt")).toBe("/root/a.txt");

    const tree = await fs.listTree("/root");
    expect(tree).toEqual(
      expect.arrayContaining([
        { path: "a.txt", size: 1 },
        { path: "sub/b.txt", size: 2 },
      ]),
    );

    const names = await fs.readdir("/root");
    expect(new Set(names)).toEqual(new Set(["a.txt", "sub"]));
  });

  it("truncates and rewrites files with open('w')", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/data.txt", fromString("long data"));

    const rewritten = await fs.open("/data.txt", "w");
    const short = fromString("ok");
    await rewritten.write(short, 0, short.length, 0);
    await rewritten.close();

    const bytes = await readAll(fs, "/data.txt");
    expect(decodeToString(bytes)).toBe("ok");
  });

  it("supports append-like r+ writes and preserves existing content", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/append.txt", fromString("abc"));

    const handle = await fs.open("/append.txt", "r+");
    const suffix = fromString("def");
    await handle.write(suffix, 0, suffix.length, 3);
    await handle.close();

    const file = await readAll(fs, "/append.txt");
    expect(decodeToString(file)).toBe("abcdef");

    const all = concat([fromString("abc"), suffix]);
    expect(file).toEqual(all);
  });
});
