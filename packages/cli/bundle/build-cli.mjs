#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
);

async function build() {
  console.log("Building CLI bundle...");

  const outfile = path.join(__dirname, "../dist/cli.js");

  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, "../src/index.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile,
    banner: { js: "#!/usr/bin/env node" },
    external: [],
    minify: false,
    sourcemap: false,
    define: {
      OK200_VERSION: JSON.stringify(packageJson.version),
    },
  });

  if (result.errors.length > 0) {
    console.error("Build failed with errors:");
    for (const err of result.errors) console.error(err);
    process.exit(1);
  }

  fs.chmodSync(outfile, 0o755);

  const sizeKB = (fs.statSync(outfile).size / 1024).toFixed(1);
  console.log(`\nBuild complete: dist/cli.js`);
  console.log(`  Size: ${sizeKB} KB`);
  console.log(`  Version: ${packageJson.version}`);
}

build();
