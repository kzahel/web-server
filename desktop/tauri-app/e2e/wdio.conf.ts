import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import type { Options } from "@wdio/types";

const BINARY_PATH = path.resolve(__dirname, "../../target/debug/ok200-desktop");

const CARGO_BIN = path.join(os.homedir(), ".cargo", "bin");
const TAURI_DRIVER = path.join(CARGO_BIN, "tauri-driver");

let tauriDriver: ChildProcess | null = null;

async function isPortReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForPort(port: number, timeout = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortReady(port)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Port ${port} not ready within ${timeout}ms`);
}

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    tsNodeOpts: {
      project: "./tsconfig.json",
    },
  },
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: BINARY_PATH,
      },
    } as unknown as WebdriverIO.Capabilities,
  ],
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  async onPrepare() {
    // Build if needed
    if (!process.env.SKIP_BUILD) {
      console.log("Building Tauri app (debug, no-bundle)...");
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      env.PATH = `${CARGO_BIN}:${env.PATH}`;
      execSync("pnpm tauri build --debug --no-bundle", {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        env,
      });
    }

    // Check if tauri-driver is already running
    if (await isPortReady(4444)) {
      console.log("tauri-driver already running on port 4444");
      return;
    }

    // Start tauri-driver
    console.log("Starting tauri-driver...");
    tauriDriver = spawn(TAURI_DRIVER, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":99" },
    });
    tauriDriver.stdout?.on("data", (d: Buffer) =>
      process.stdout.write(`[tauri-driver] ${d}`),
    );
    tauriDriver.stderr?.on("data", (d: Buffer) =>
      process.stderr.write(`[tauri-driver] ${d}`),
    );
    tauriDriver.on("error", (err) => {
      console.error("tauri-driver spawn error:", err);
    });
    tauriDriver.on("exit", (code, signal) => {
      console.log(`tauri-driver exited: code=${code} signal=${signal}`);
      tauriDriver = null;
    });

    await waitForPort(4444);
    console.log("tauri-driver ready on port 4444");
  },

  onComplete() {
    if (tauriDriver) {
      console.log("Killing tauri-driver...");
      tauriDriver.kill();
      tauriDriver = null;
    }
  },
};
