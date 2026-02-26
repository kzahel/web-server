/**
 * Types for Tauri IPC dependency injection.
 *
 * These allow the adapter to work without importing @tauri-apps/api directly,
 * keeping that dependency out of the engine package.
 */

/** Tauri invoke function signature. */
export type TauriInvokeFn = {
  <T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  <T>(
    cmd: string,
    body: ArrayBuffer,
    options?: { headers?: Record<string, string> },
  ): Promise<T>;
};

/** Tauri Channel constructor. */
export type TauriChannelCtor = new (
  callback: (event: unknown) => void,
) => unknown;

/** Control events sent as JSON from Rust through the channel. */
export type ControlEvent =
  | {
      type: "listening";
      serverId: number;
      port: number;
    }
  | {
      type: "listen_error";
      serverId: number;
      error: string;
    }
  | {
      type: "accept";
      serverId: number;
      socketId: number;
      remoteAddress: string;
      remotePort: number;
    }
  | {
      type: "close";
      socketId: number;
      hadError: boolean;
    }
  | {
      type: "error";
      socketId: number;
      message: string;
    };
