import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
  TcpSocketOptions,
} from "../interfaces/socket.js";
import { concat, fromString } from "../utils/buffer.js";

class InMemoryTcpSocket implements ITcpSocket {
  remoteAddress?: string;
  remotePort?: number;

  private peer: InMemoryTcpSocket | null = null;
  private closed = false;
  private dataCallbacks: Array<(data: Uint8Array) => void> = [];
  private closeCallbacks: Array<(hadError: boolean) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];

  static createPair(): [InMemoryTcpSocket, InMemoryTcpSocket] {
    const a = new InMemoryTcpSocket();
    const b = new InMemoryTcpSocket();
    a.peer = b;
    b.peer = a;
    a.remoteAddress = "in-memory";
    b.remoteAddress = "in-memory";
    a.remotePort = 1;
    b.remotePort = 2;
    return [a, b];
  }

  send(data: Uint8Array): void {
    if (this.closed || !this.peer || this.peer.closed) {
      return;
    }

    const copy = data.slice();
    queueMicrotask(() => {
      this.peer?.emitData(copy);
    });
  }

  sendAndWait(data: Uint8Array): Promise<void> {
    this.send(data);
    return Promise.resolve();
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
    this.closeInternal(false);
  }

  private emitData(data: Uint8Array): void {
    if (this.closed) return;
    for (const cb of this.dataCallbacks) {
      cb(data);
    }
  }

  private closeInternal(fromPeer: boolean): void {
    if (this.closed) return;
    this.closed = true;

    for (const cb of this.closeCallbacks) {
      cb(false);
    }

    if (!fromPeer && this.peer) {
      this.peer.closeInternal(true);
    }
  }
}

class InMemoryTcpServer implements ITcpServer {
  private listening = false;
  private port: number | null = null;
  private connectionCallbacks: Array<(socket: unknown) => void> = [];

  constructor(private readonly allocatePort: () => number) {}

  listen(port: number, _host?: string, callback?: () => void): void {
    this.port = port === 0 ? this.allocatePort() : port;
    this.listening = true;
    queueMicrotask(() => callback?.());
  }

  address(): { port: number } | null {
    if (!this.listening || this.port === null) {
      return null;
    }
    return { port: this.port };
  }

  on(event: "connection", cb: (socket: unknown) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(
    event: "connection" | "error",
    cb: ((socket: unknown) => void) | ((err: Error) => void),
  ): void {
    if (event === "connection") {
      this.connectionCallbacks.push(cb as (socket: unknown) => void);
      return;
    }
    // No-op by default; tests can add explicit fault injection if needed.
  }

  close(callback?: () => void): void {
    this.listening = false;
    this.port = null;
    queueMicrotask(() => callback?.());
  }

  isListening(): boolean {
    return this.listening;
  }

  accept(socket: InMemoryTcpSocket): void {
    if (!this.listening) {
      throw new Error("In-memory server is not listening");
    }
    for (const cb of this.connectionCallbacks) {
      cb(socket);
    }
  }
}

export class InMemorySocketFactory implements ISocketFactory {
  private nextPort = 41000;
  private server: InMemoryTcpServer | null = null;

  async createTcpSocket(options?: TcpSocketOptions): Promise<ITcpSocket> {
    if (options?.host || options?.port) {
      throw new Error(
        "InMemorySocketFactory.createTcpSocket does not support outbound connect",
      );
    }
    return new InMemoryTcpSocket();
  }

  createTcpServer(): ITcpServer {
    const server = new InMemoryTcpServer(() => this.nextPort++);
    this.server = server;
    return server;
  }

  wrapTcpSocket(socket: unknown): ITcpSocket {
    if (!(socket instanceof InMemoryTcpSocket)) {
      throw new Error("Expected an InMemoryTcpSocket instance");
    }
    return socket;
  }

  async request(rawHttp: string | Uint8Array): Promise<Uint8Array> {
    if (!this.server || !this.server.isListening()) {
      throw new Error("In-memory server is not listening");
    }

    const payload = typeof rawHttp === "string" ? fromString(rawHttp) : rawHttp;
    const [clientSocket, serverSocket] = InMemoryTcpSocket.createPair();

    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let done = false;

      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("Timed out waiting for in-memory response"));
      }, 1000);

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve(concat(chunks));
      };

      const fail = (err: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        reject(err);
      };

      clientSocket.onData((data) => {
        chunks.push(data.slice());
      });
      clientSocket.onClose(() => finish());
      clientSocket.onError((err) => fail(err));

      try {
        this.server?.accept(serverSocket);
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      queueMicrotask(() => clientSocket.send(payload));
    });
  }
}
