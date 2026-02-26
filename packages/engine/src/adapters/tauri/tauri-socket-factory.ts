/**
 * Tauri socket factory — central event router.
 *
 * Follows the NativeSocketFactory pattern: holds Maps of servers and sockets
 * keyed by ID, routes events from the channel to the right instance.
 *
 * Each server gets its own Channel that multiplexes both binary data and
 * JSON control events. Binary frames have a 4-byte BE socket ID prefix.
 * JSON events are control messages (accept, close, error, listening).
 * JS distinguishes them via `instanceof ArrayBuffer`.
 */

import type { TlsOptions } from "../../interfaces/certificate.js";
import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
} from "../../interfaces/socket.js";
import { TauriTcpServer } from "./tauri-tcp-server.js";
import { TauriTcpSocket } from "./tauri-tcp-socket.js";
import type { ControlEvent, TauriChannelCtor, TauriInvokeFn } from "./types.js";

export class TauriSocketFactory implements ISocketFactory {
  private servers = new Map<number, TauriTcpServer>();
  private sockets = new Map<number, TauriTcpSocket>();

  constructor(
    private readonly invoke: TauriInvokeFn,
    private readonly ChannelCtor: TauriChannelCtor,
  ) {}

  async createTcpSocket(): Promise<ITcpSocket> {
    throw new Error("Client TCP sockets not supported in Tauri server mode");
  }

  createTcpServer(_tlsOptions?: TlsOptions): ITcpServer {
    const server = new TauriTcpServer(this.invoke);

    // Override listen() to wire up the channel and invoke
    const originalListen = server.listen.bind(server);
    server.listen = (
      port: number,
      host?: string,
      callback?: () => void,
    ): void => {
      // Call original to store the callback
      originalListen(port, host, callback);

      // Create a Channel that routes events
      const channel = new this.ChannelCtor((event: unknown) => {
        this.handleChannelEvent(event);
      });

      // Invoke the Rust command to create the server
      this.invoke<number>("tcp_server_create", {
        port,
        host: host || "0.0.0.0",
        channel,
      })
        .then((serverId) => {
          server.serverId = serverId;
          this.servers.set(serverId, server);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          server._onListenError(message);
        });
    };

    return server;
  }

  wrapTcpSocket(socket: unknown): ITcpSocket {
    // The socket is already a TauriTcpSocket created in the accept handler
    return socket as ITcpSocket;
  }

  private handleChannelEvent(event: unknown): void {
    if (event instanceof ArrayBuffer) {
      this.handleBinaryFrame(event);
    } else {
      this.handleControlEvent(event as ControlEvent);
    }
  }

  private handleBinaryFrame(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 4) return;
    const view = new DataView(buffer);
    const socketId = view.getUint32(0, false); // big-endian
    const data = new Uint8Array(buffer, 4);
    const socket = this.sockets.get(socketId);
    socket?._onData(data);
  }

  private handleControlEvent(event: ControlEvent): void {
    switch (event.type) {
      case "listening": {
        const server = this.servers.get(event.serverId);
        server?._onListening(event.port);
        break;
      }
      case "listen_error": {
        const server = this.servers.get(event.serverId);
        server?._onListenError(event.error);
        break;
      }
      case "accept": {
        const server = this.servers.get(event.serverId);
        if (server) {
          const socket = new TauriTcpSocket(
            event.socketId,
            this.invoke,
            event.remoteAddress,
            event.remotePort,
          );
          this.sockets.set(event.socketId, socket);
          server._onAccept(socket);
        }
        break;
      }
      case "close": {
        const socket = this.sockets.get(event.socketId);
        socket?._onClose(event.hadError);
        this.sockets.delete(event.socketId);
        break;
      }
      case "error": {
        const socket = this.sockets.get(event.socketId);
        socket?._onError(event.message);
        break;
      }
    }
  }
}
