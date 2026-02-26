/**
 * Tauri TCP server adapter.
 *
 * Mirrors the NativeTcpServer pattern: stores callbacks, has internal
 * _onListening/_onAccept/_onError methods called by the socket factory.
 * The listen() method is fire-and-forget (void return); the actual result
 * comes back asynchronously via the channel.
 */

import type { ITcpServer } from "../../interfaces/socket.js";
import type { TauriInvokeFn } from "./types.js";

export class TauriTcpServer implements ITcpServer {
  private connectionCallback?: (socket: unknown) => void;
  private errorCallback?: (err: Error) => void;
  private listenCallback?: () => void;
  private closed = false;

  serverId?: number;
  private listeningPort?: number;

  constructor(private readonly invoke: TauriInvokeFn) {}

  listen(_port: number, _host?: string, callback?: () => void): void {
    this.listenCallback = callback;
    // listen() is fire-and-forget. The factory overrides this method
    // to wire up the channel and invoke the Rust command.
  }

  address(): { port: number } | null {
    if (this.listeningPort == null) return null;
    return { port: this.listeningPort };
  }

  on(event: "connection", cb: (socket: unknown) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(
    event: "connection" | "error",
    cb: ((socket: unknown) => void) | ((err: Error) => void),
  ): void {
    if (event === "connection") {
      this.connectionCallback = cb as (socket: unknown) => void;
    } else if (event === "error") {
      this.errorCallback = cb as (err: Error) => void;
    }
  }

  close(callback?: () => void): void {
    if (this.closed) return;
    this.closed = true;
    if (this.serverId != null) {
      this.invoke("tcp_server_close", { serverId: this.serverId }).catch(
        () => {},
      );
    }
    callback?.();
  }

  /** Called by the socket factory when listening succeeds. */
  _onListening(port: number): void {
    this.listeningPort = port;
    this.listenCallback?.();
  }

  /** Called by the socket factory when listening fails. */
  _onListenError(error: string): void {
    this.errorCallback?.(new Error(error));
  }

  /** Called by the socket factory when a new connection is accepted. */
  _onAccept(socket: unknown): void {
    this.connectionCallback?.(socket);
  }
}
