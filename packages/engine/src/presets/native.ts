import {
  NativeFileSystem,
  NativeSocketFactory,
} from "../adapters/native/index.js";
import type { ServerConfig } from "../config/server-config.js";
import type { Logger } from "../logging/logger.js";
import { WebServer } from "../server/web-server.js";

export interface NativeServerOptions {
  config: ServerConfig;
  logger?: Logger;
}

export function createNativeServer(options: NativeServerOptions): WebServer {
  const socketFactory = new NativeSocketFactory();
  const fileSystem = new NativeFileSystem();
  return new WebServer({
    socketFactory,
    fileSystem,
    config: options.config,
    logger: options.logger,
  });
}
