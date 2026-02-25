export interface NativeResponse {
  id: string;
  ok: boolean;
  error?: string;
  type?: string;
  payload?: unknown;
}

export interface INativeHostConnection {
  connect(): Promise<void>;
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
  onDisconnect(cb: () => void): void;
  isConnected(): boolean;
  isDisconnected(): boolean;
}

// Singleton enforcement
let singletonInstance: NativeHostConnection | null = null;
let singletonCreated = false;

/**
 * Get the singleton NativeHostConnection instance.
 * Creates the instance on first call.
 */
export function getNativeConnection(): NativeHostConnection {
  if (!singletonInstance) {
    singletonInstance = new NativeHostConnection();
  }
  return singletonInstance;
}

/**
 * Reset the singleton for testing purposes only.
 * @internal
 */
export function resetNativeConnection(): void {
  singletonInstance = null;
  singletonCreated = false;
}

export class NativeHostConnection implements INativeHostConnection {
  private port: chrome.runtime.Port | null = null;
  private connected = false;
  private disconnected = false;
  private disconnectCallbacks: Array<() => void> = [];
  private connectPromise: Promise<void> | null = null;

  constructor() {
    if (singletonCreated) {
      throw new Error(
        "NativeHostConnection is a singleton. Use getNativeConnection() instead of new NativeHostConnection()",
      );
    }
    singletonCreated = true;
  }

  private resetState(): void {
    this.port = null;
    this.connected = false;
    this.disconnected = false;
    this.disconnectCallbacks = [];
  }

  async connect(): Promise<void> {
    if (this.connectPromise) {
      console.log(
        "[NativeHostConnection] connect() already in progress, returning existing promise",
      );
      return this.connectPromise;
    }

    if (this.connected && !this.disconnected) {
      console.log(
        "[NativeHostConnection] connect() called but already connected",
      );
      return;
    }

    if (this.disconnected) {
      console.log(
        "[NativeHostConnection] Reconnecting after previous disconnect",
      );
      this.resetState();
    }

    this.connectPromise = this.doConnect();
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.port = chrome.runtime.connectNative("app.ok200.native");

        const disconnectHandler = () => {
          const error =
            chrome.runtime.lastError?.message || "Native host disconnected";
          console.error("[NativeHostConnection] Connection failed:", error);
          this.disconnected = true;
          this.connected = false;
          reject(new Error(error));
        };

        this.port.onDisconnect.addListener(disconnectHandler);

        setTimeout(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (this.port && !this.disconnected) {
            this.port.onDisconnect.removeListener(disconnectHandler);
            this.connected = true;

            this.port.onDisconnect.addListener(() => {
              console.log("[NativeHostConnection] Native host disconnected");
              this.disconnected = true;
              this.connected = false;
              for (const callback of this.disconnectCallbacks) {
                try {
                  callback();
                } catch (e) {
                  console.error(
                    "[NativeHostConnection] Disconnect callback error:",
                    e,
                  );
                }
              }
            });

            resolve();
          }
        }, 50);
      } catch (e) {
        reject(e);
      }
    });
  }

  send(msg: unknown) {
    this.port?.postMessage(msg);
  }

  onMessage(cb: (msg: unknown) => void) {
    if (!this.port) {
      console.error(
        "[NativeHostConnection] onMessage called but port is null!",
      );
      return;
    }
    this.port.onMessage.addListener((msg: unknown) => {
      console.log(
        "[NativeHostConnection] Received message:",
        JSON.stringify(msg),
      );
      cb(msg);
    });
  }

  onDisconnect(cb: () => void) {
    this.disconnectCallbacks.push(cb);
  }

  isConnected(): boolean {
    return this.connected && this.port !== null && !this.disconnected;
  }

  isDisconnected(): boolean {
    return this.disconnected;
  }
}
