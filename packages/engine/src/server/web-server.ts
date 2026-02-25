import type { ServerConfig } from "../config/server-config.js";
import { parseHttpRequest } from "../http/request-parser.js";
import { sendResponse } from "../http/response-writer.js";
import { STATUS_TEXT } from "../http/types.js";
import type { IFileSystem } from "../interfaces/filesystem.js";
import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
} from "../interfaces/socket.js";
import type { Logger } from "../logging/logger.js";
import { basicLogger } from "../logging/logger.js";
import { fromString } from "../utils/buffer.js";
import { EventEmitter } from "../utils/event-emitter.js";
import { StaticServer } from "./static-server.js";

export interface WebServerOptions {
  socketFactory: ISocketFactory;
  fileSystem: IFileSystem;
  config: ServerConfig;
  logger?: Logger;
}

export class WebServer extends EventEmitter {
  private socketFactory: ISocketFactory;
  private fileSystem: IFileSystem;
  private config: ServerConfig;
  private logger: Logger;
  private tcpServer: ITcpServer | null = null;
  private staticServer: StaticServer;
  private activeConnections: Set<ITcpSocket> = new Set();

  constructor(options: WebServerOptions) {
    super();
    this.socketFactory = options.socketFactory;
    this.fileSystem = options.fileSystem;
    this.config = options.config;
    this.logger = options.logger ?? basicLogger();

    this.staticServer = new StaticServer({
      root: this.config.root,
      fs: this.fileSystem,
      directoryListing: this.config.directoryListing,
      spa: this.config.spa,
      cors: this.config.cors,
      logger: this.logger,
    });
  }

  start(): Promise<number> {
    if (this.tcpServer) {
      return Promise.reject(new Error("Server is already started"));
    }

    return new Promise((resolve, reject) => {
      const server = this.socketFactory.createTcpServer();
      this.tcpServer = server;

      let settled = false;

      server.on("connection", (rawSocket) => {
        const socket = this.socketFactory.wrapTcpSocket(rawSocket);
        this.handleConnection(socket);
      });

      server.on("error", (err) => {
        if (!settled) {
          settled = true;
          this.tcpServer = null;
          reject(err);
          return;
        }

        this.logger.error("TCP server error:", err);
        this.emit("error", err);
      });

      server.listen(this.config.port, this.config.host, () => {
        if (settled) return;
        settled = true;
        const addr = server.address();
        const port = addr?.port ?? this.config.port;
        this.emit("listening", port);
        resolve(port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.tcpServer;
      this.tcpServer = null;

      // Close all active connections
      for (const socket of this.activeConnections) {
        socket.close();
      }
      this.activeConnections.clear();

      if (!server) {
        this.emit("close");
        resolve();
        return;
      }

      server.close(() => {
        this.emit("close");
        resolve();
      });
    });
  }

  private async handleConnection(socket: ITcpSocket): Promise<void> {
    this.activeConnections.add(socket);

    socket.onClose(() => {
      this.activeConnections.delete(socket);
    });

    socket.onError(() => {
      this.activeConnections.delete(socket);
    });

    try {
      const request = await parseHttpRequest(socket, {
        timeoutMs: this.config.requestTimeoutMs,
      });

      if (!this.config.quiet) {
        const addr = socket.remoteAddress ?? "?";
        this.logger.info(`${request.method} ${request.url} - ${addr}`);
      }

      await this.staticServer.handleRequest(socket, request);
    } catch (_err) {
      // Parsing failed or connection closed — send 400 if socket is still open
      try {
        sendResponse(socket, {
          status: 400,
          statusText: STATUS_TEXT[400],
          body: fromString("Bad Request"),
        });
      } catch {
        // Socket already closed
      }
    } finally {
      // Close connection after response (HTTP/1.0 style for MVP)
      try {
        socket.close();
      } catch {
        // Already closed
      }
    }
  }
}
