import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface Fixtures {
  /** Directory with index.html, hello.txt, sub/nested.txt */
  rootDir: string;
  /** Directory without index.html (for directory listing tests) */
  noIndexDir: string;
}

export async function createFixtures(): Promise<Fixtures> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ok200-e2e-"));
  await fs.writeFile(path.join(rootDir, "index.html"), "<h1>Home</h1>");
  await fs.writeFile(path.join(rootDir, "hello.txt"), "Hello, world!");
  await fs.mkdir(path.join(rootDir, "sub"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "sub", "nested.txt"), "nested content");

  const noIndexDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "ok200-e2e-noindex-"),
  );
  await fs.writeFile(path.join(noIndexDir, "file-a.txt"), "a");
  await fs.writeFile(path.join(noIndexDir, "file-b.txt"), "b");

  return { rootDir, noIndexDir };
}

export async function cleanupFixtures(fixtures: Fixtures): Promise<void> {
  await fs.rm(fixtures.rootDir, { recursive: true, force: true });
  await fs.rm(fixtures.noIndexDir, { recursive: true, force: true });
}
