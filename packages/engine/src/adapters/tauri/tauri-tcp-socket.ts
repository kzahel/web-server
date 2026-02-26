/**
 * Tauri TCP socket adapter for accepted connections.
 *
 * Mirrors the NativeTcpSocket pattern: stores callbacks, has internal
 * _onData/_onClose/_onError methods called by the socket factory's
 * channel event router. Uses multiple callbacks per event to match
 * the Node adapter behavior expected by WebServer.
 */

import type { ITcpSocket } from "../../interfaces/socket.js";
import type { TauriInvokeFn } from "./types.js";

export class TauriTcpSocket implements ITcpSocket {
  private dataCallbacks: Array<(data: Uint8Array) => void> = [];
  private closeCallbacks: Array<(hadError: boolean) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];
  private closed = false;

  remoteAddress?: string;
  remotePort?: number;

  constructor(
    private readonly socketId: number,
    private readonly invoke: TauriInvokeFn,
    remoteAddr?: string,
    remotePort?: number,
  ) {
    this.remoteAddress = remoteAddr;
    this.remotePort = remotePort;
  }

  send(data: Uint8Array): void {
    if (this.closed) return;
    this.sendAndWait(data).catch(() => {});
  }

  async sendAndWait(data: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Socket closed");
    await this.invoke("tcp_send", data.buffer as ArrayBuffer, {
      headers: { "x-socket-id": String(this.socketId) },
    });
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.dataCallbacks.push(cb);
  }

  onClose(cb: (hadError: boolean) => void): void {
    this.closeCallbacks.push(cb);
  }

  onError(cb: (err: Error) => void): void {
    this.errorCallbacks.push(cb);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.invoke("tcp_close", { socketId: this.socketId }).catch(() => {});
  }

  /** Called by the socket factory when data arrives from the channel. */
  _onData(data: Uint8Array): void {
    for (const cb of this.dataCallbacks) cb(data);
  }

  /** Called by the socket factory when the connection closes. */
  _onClose(hadError: boolean): void {
    this.closed = true;
    for (const cb of this.closeCallbacks) cb(hadError);
  }

  /** Called by the socket factory when an error occurs. */
  _onError(message: string): void {
    const err = new Error(message);
    for (const cb of this.errorCallbacks) cb(err);
  }
}
