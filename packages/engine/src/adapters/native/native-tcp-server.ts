/**
 * Native TCP server adapter (QuickJS/Android).
 */

import type { ITcpServer } from "../../interfaces/socket.js";

export class NativeTcpServer implements ITcpServer {
  private connectionCallback?: (socket: unknown) => void;
  private errorCallback?: (err: Error) => void;
  private listenCallback?: () => void;
  private serverId: number;
  private closed = false;

  constructor(serverId: number) {
    this.serverId = serverId;
  }

  listen(port: number, host?: string, callback?: () => void): void {
    this.listenCallback = callback;
    __ok200_tcp_server_listen(
      String(this.serverId),
      String(port),
      host || "0.0.0.0",
    );
  }

  address(): { port: number } | null {
    const result = __ok200_tcp_server_address(String(this.serverId));
    if (!result) return null;
    try {
      return JSON.parse(result) as { port: number };
    } catch {
      return null;
    }
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
    __ok200_tcp_server_close(String(this.serverId));
    callback?.();
  }

  /** Called by the socket factory when the server starts listening. */
  _onListening(success: boolean, port: number): void {
    if (success) {
      this.listenCallback?.();
    } else {
      this.errorCallback?.(new Error(`Failed to listen on port ${port}`));
    }
  }

  /** Called by the socket factory when a new connection is accepted. */
  _onAccept(socket: unknown): void {
    this.connectionCallback?.(socket);
  }
}
