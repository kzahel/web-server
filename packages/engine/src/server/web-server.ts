import type { ISocketFactory, ITcpServer, ITcpSocket } from '../interfaces/socket.js'
import type { IFileSystem } from '../interfaces/filesystem.js'
import { parseHttpRequest } from '../http/request-parser.js'
import { sendResponse } from '../http/response-writer.js'
import { fromString } from '../utils/buffer.js'
import { STATUS_TEXT } from '../http/types.js'
import { StaticServer } from './static-server.js'
import { EventEmitter } from '../utils/event-emitter.js'
import type { Logger } from '../logging/logger.js'
import { basicLogger } from '../logging/logger.js'
import type { ServerConfig } from '../config/server-config.js'

export interface WebServerOptions {
  socketFactory: ISocketFactory
  fileSystem: IFileSystem
  config: ServerConfig
  logger?: Logger
}

export class WebServer extends EventEmitter {
  private socketFactory: ISocketFactory
  private fileSystem: IFileSystem
  private config: ServerConfig
  private logger: Logger
  private tcpServer: ITcpServer | null = null
  private staticServer: StaticServer
  private activeConnections: Set<ITcpSocket> = new Set()

  constructor(options: WebServerOptions) {
    super()
    this.socketFactory = options.socketFactory
    this.fileSystem = options.fileSystem
    this.config = options.config
    this.logger = options.logger ?? basicLogger()

    this.staticServer = new StaticServer({
      root: this.config.root,
      fs: this.fileSystem,
      directoryListing: this.config.directoryListing,
      spa: this.config.spa,
      cors: this.config.cors,
      logger: this.logger,
    })
  }

  start(): Promise<number> {
    return new Promise((resolve) => {
      this.tcpServer = this.socketFactory.createTcpServer()

      this.tcpServer.on('connection', (rawSocket) => {
        const socket = this.socketFactory.wrapTcpSocket(rawSocket)
        this.handleConnection(socket)
      })

      this.tcpServer.listen(this.config.port, this.config.host, () => {
        const addr = this.tcpServer!.address()
        const port = addr?.port ?? this.config.port
        this.emit('listening', port)
        resolve(port)
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all active connections
      for (const socket of this.activeConnections) {
        socket.close()
      }
      this.activeConnections.clear()

      if (this.tcpServer) {
        this.tcpServer.close()
        this.tcpServer = null
      }
      this.emit('close')
      resolve()
    })
  }

  private async handleConnection(socket: ITcpSocket): Promise<void> {
    this.activeConnections.add(socket)

    socket.onClose(() => {
      this.activeConnections.delete(socket)
    })

    socket.onError(() => {
      this.activeConnections.delete(socket)
    })

    try {
      const request = await parseHttpRequest(socket)

      if (!this.config.quiet) {
        const addr = socket.remoteAddress ?? '?'
        this.logger.info(`${request.method} ${request.url} - ${addr}`)
      }

      await this.staticServer.handleRequest(socket, request)
    } catch (err) {
      // Parsing failed or connection closed — send 400 if socket is still open
      try {
        sendResponse(socket, {
          status: 400,
          statusText: STATUS_TEXT[400],
          body: fromString('Bad Request'),
        })
      } catch {
        // Socket already closed
      }
    } finally {
      // Close connection after response (HTTP/1.0 style for MVP)
      try {
        socket.close()
      } catch {
        // Already closed
      }
    }
  }
}
