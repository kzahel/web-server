/**
 * Wires the engine to Tauri's IPC layer.
 * This is the desktop equivalent of the CLI's server setup.
 */

import {
  createTauriServer,
  defaultConfig,
  type Logger,
  type TauriChannelCtor,
  type TauriInvokeFn,
  type WebServer,
} from "@ok200/engine";
import { Channel, invoke } from "@tauri-apps/api/core";

let server: WebServer | null = null;

export interface StartOptions {
  root: string;
  port?: number;
  host?: string;
  cors?: boolean;
  spa?: boolean;
  upload?: boolean;
  logger?: Logger;
}

export async function startServer(options: StartOptions): Promise<number> {
  if (server) {
    await server.stop();
  }

  const config = defaultConfig(options.root);
  config.port = options.port ?? 8080;
  config.host = options.host ?? "0.0.0.0";
  config.cors = options.cors ?? true;
  config.spa = options.spa ?? false;
  config.upload = options.upload ?? false;

  server = createTauriServer({
    invoke: invoke as TauriInvokeFn,
    Channel: Channel as unknown as TauriChannelCtor,
    config,
    logger: options.logger,
  });

  const actualPort = await server.start();
  return actualPort;
}

export async function stopServer(): Promise<void> {
  if (server) {
    await server.stop();
    server = null;
  }
}

export function isRunning(): boolean {
  return server !== null;
}
