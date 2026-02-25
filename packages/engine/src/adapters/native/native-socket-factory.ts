/**
 * Native socket factory for QuickJS/Android.
 */

import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
} from "../../interfaces/socket.js";
import { NativeTcpServer } from "./native-tcp-server.js";
import { NativeTcpSocket } from "./native-tcp-socket.js";

export class NativeSocketFactory implements ISocketFactory {
  private servers = new Map<number, NativeTcpServer>();
  private sockets = new Map<number, NativeTcpSocket>();
  private initialized = false;

  constructor() {
    this.setupEventHandlers();
  }

  async createTcpSocket(): Promise<ITcpSocket> {
    throw new Error("Client TCP sockets not supported in server mode");
  }

  createTcpServer(): ITcpServer {
    const serverId = parseInt(__ok200_tcp_server_create(), 10);
    const server = new NativeTcpServer(serverId);
    this.servers.set(serverId, server);
    return server;
  }

  wrapTcpSocket(socket: unknown): ITcpSocket {
    // The socket is already a NativeTcpSocket created in the accept handler
    return socket as ITcpSocket;
  }

  private setupEventHandlers(): void {
    if (this.initialized) return;
    this.initialized = true;

    __ok200_tcp_on_data((socketId: number, data: ArrayBuffer) => {
      const socket = this.sockets.get(socketId);
      socket?._onData(data);
    });

    __ok200_tcp_on_close((socketId: number, hadError: boolean) => {
      const socket = this.sockets.get(socketId);
      socket?._onClose(hadError);
      this.sockets.delete(socketId);
    });

    __ok200_tcp_on_error((socketId: number, message: string) => {
      const socket = this.sockets.get(socketId);
      socket?._onError(message);
    });

    __ok200_tcp_on_listening(
      (serverId: number, success: boolean, port: number) => {
        const server = this.servers.get(serverId);
        server?._onListening(success, port);
      },
    );

    __ok200_tcp_on_accept(
      (
        serverId: number,
        socketId: number,
        remoteAddr: string,
        remotePort: number,
      ) => {
        const server = this.servers.get(serverId);
        if (server) {
          const socket = new NativeTcpSocket(socketId, remoteAddr, remotePort);
          this.sockets.set(socketId, socket);
          server._onAccept(socket);
        }
      },
    );
  }
}
