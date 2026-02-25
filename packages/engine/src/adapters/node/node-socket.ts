import * as net from 'net'
import * as tls from 'tls'
import type { ITcpServer, ITcpSocket, ISocketFactory, TcpSocketOptions } from '../../interfaces/socket.js'

export class NodeTcpSocket implements ITcpSocket {
  private socket: net.Socket | tls.TLSSocket
  private _isSecure = false

  private dataCallbacks: Array<(data: Uint8Array) => void> = []
  private closeCallbacks: Array<(hadError: boolean) => void> = []
  private errorCallbacks: Array<(err: Error) => void> = []

  constructor(socket?: net.Socket | tls.TLSSocket) {
    this.socket = socket || new net.Socket()
    if (socket instanceof tls.TLSSocket) {
      this._isSecure = true
    }
  }

  get remoteAddress(): string | undefined {
    return this.socket.remoteAddress
  }

  get remotePort(): number | undefined {
    return this.socket.remotePort
  }

  get isSecure(): boolean {
    return this._isSecure
  }

  connect(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.connect(port, host, () => {
        resolve()
      })

      this.socket.once('error', (err) => {
        reject(err)
      })
    })
  }

  send(data: Uint8Array): void {
    if (this.socket.destroyed || !this.socket.writable) {
      return
    }
    try {
      this.socket.write(data)
    } catch {
      // Socket write failed — connection likely closing
    }
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.dataCallbacks.push(cb)
    this.socket.on('data', (data) => {
      cb(new Uint8Array(data))
    })
  }

  onClose(cb: (hadError: boolean) => void): void {
    this.closeCallbacks.push(cb)
    this.socket.on('close', cb)
  }

  onError(cb: (err: Error) => void): void {
    this.errorCallbacks.push(cb)
    this.socket.on('error', cb)
  }

  close(): void {
    this.socket.destroy()
  }

  async secure(hostname: string, options?: { skipValidation?: boolean }): Promise<void> {
    if (this._isSecure) {
      throw new Error('Socket is already secure')
    }

    const plainSocket = this.socket as net.Socket

    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket: plainSocket,
        servername: hostname,
        rejectUnauthorized: !options?.skipValidation,
      }

      const tlsSocket = tls.connect(tlsOptions, () => {
        this._isSecure = true

        plainSocket.removeAllListeners('data')
        plainSocket.removeAllListeners('close')
        plainSocket.removeAllListeners('error')

        for (const cb of this.dataCallbacks) {
          tlsSocket.on('data', (data) => cb(new Uint8Array(data)))
        }
        for (const cb of this.closeCallbacks) {
          tlsSocket.on('close', cb)
        }
        for (const cb of this.errorCallbacks) {
          tlsSocket.on('error', cb)
        }

        this.socket = tlsSocket
        resolve()
      })

      tlsSocket.once('error', (err) => {
        reject(err)
      })
    })
  }
}

export class NodeTcpServer implements ITcpServer {
  private server: net.Server

  constructor() {
    this.server = net.createServer()
  }

  listen(port: number, host?: string, callback?: () => void): void {
    this.server.listen(port, host, callback)
  }

  address(): { port: number } | null {
    const addr = this.server.address()
    if (addr && typeof addr === 'object' && 'port' in addr) {
      return { port: addr.port }
    }
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'connection', cb: (socket: any) => void): void {
    this.server.on(event, cb)
  }

  close(): void {
    this.server.close()
  }
}

export class NodeSocketFactory implements ISocketFactory {
  async createTcpSocket(options?: TcpSocketOptions): Promise<ITcpSocket> {
    const socket = new NodeTcpSocket()
    if (options?.host && options?.port) {
      await socket.connect(options.port, options.host)
    }
    return socket
  }

  createTcpServer(): ITcpServer {
    return new NodeTcpServer()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapTcpSocket(socket: any): ITcpSocket {
    return new NodeTcpSocket(socket)
  }
}
