import type { IFileSystem } from '../interfaces/filesystem.js'
import type { ITcpSocket } from '../interfaces/socket.js'
import type { HttpRequest } from '../http/types.js'
import { STATUS_TEXT } from '../http/types.js'
import { sendResponse, sendFileResponse } from '../http/response-writer.js'
import { getMimeType } from './mime-types.js'
import { generateDirectoryListing } from './directory-listing.js'
import { fromString } from '../utils/buffer.js'
import type { Logger } from '../logging/logger.js'

export interface StaticServerOptions {
  root: string
  fs: IFileSystem
  directoryListing: boolean
  spa: boolean
  cors: boolean
  logger?: Logger
}

export class StaticServer {
  private root: string
  private fs: IFileSystem
  private directoryListing: boolean
  private spa: boolean
  private cors: boolean
  private logger?: Logger

  constructor(options: StaticServerOptions) {
    this.root = options.root.replace(/\/+$/, '')
    this.fs = options.fs
    this.directoryListing = options.directoryListing
    this.spa = options.spa
    this.cors = options.cors
    this.logger = options.logger
  }

  async handleRequest(socket: ITcpSocket, request: HttpRequest): Promise<void> {
    const extraHeaders = new Map<string, string>()
    extraHeaders.set('server', 'ok200')
    extraHeaders.set('date', new Date().toUTCString())

    if (this.cors) {
      extraHeaders.set('access-control-allow-origin', '*')
      extraHeaders.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
      extraHeaders.set('access-control-allow-headers', '*')
    }

    if (request.method === 'OPTIONS' && this.cors) {
      sendResponse(socket, {
        status: 204,
        statusText: 'No Content',
        headers: extraHeaders,
      })
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      extraHeaders.set('allow', 'GET, HEAD, OPTIONS')
      sendResponse(socket, {
        status: 405,
        statusText: STATUS_TEXT[405],
        headers: extraHeaders,
        body: fromString('Method Not Allowed'),
      })
      return
    }

    // Decode URL and resolve path
    const urlPath = decodeRequestPath(request.url)
    if (!urlPath) {
      sendResponse(socket, {
        status: 400,
        statusText: STATUS_TEXT[400],
        headers: extraHeaders,
        body: fromString('Bad Request'),
      })
      return
    }

    const fsPath = this.root + urlPath

    // Prevent directory traversal
    if (!fsPath.startsWith(this.root + '/') && fsPath !== this.root) {
      sendResponse(socket, {
        status: 403,
        statusText: STATUS_TEXT[403],
        headers: extraHeaders,
        body: fromString('Forbidden'),
      })
      return
    }

    try {
      const exists = await this.fs.exists(fsPath)
      if (!exists) {
        return this.handleNotFound(socket, request, urlPath, extraHeaders)
      }

      const stat = await this.fs.stat(fsPath)

      if (stat.isDirectory) {
        // Try index.html
        const indexPath = fsPath + '/index.html'
        if (await this.fs.exists(indexPath)) {
          const indexStat = await this.fs.stat(indexPath)
          return this.serveFile(socket, request, indexPath, indexStat.size, indexStat.mtime, extraHeaders)
        }

        // Directory listing
        if (this.directoryListing) {
          const html = await generateDirectoryListing(this.fs, fsPath, urlPath)
          const body = fromString(html)
          extraHeaders.set('content-type', 'text/html; charset=utf-8')
          sendResponse(socket, {
            status: 200,
            statusText: STATUS_TEXT[200],
            headers: extraHeaders,
            body,
          })
          return
        }

        return this.handleNotFound(socket, request, urlPath, extraHeaders)
      }

      if (stat.isFile) {
        return this.serveFile(socket, request, fsPath, stat.size, stat.mtime, extraHeaders)
      }

      sendResponse(socket, {
        status: 404,
        statusText: STATUS_TEXT[404],
        headers: extraHeaders,
        body: fromString('Not Found'),
      })
    } catch (err) {
      this.logger?.error('Error serving request:', err)
      sendResponse(socket, {
        status: 500,
        statusText: STATUS_TEXT[500],
        headers: extraHeaders,
        body: fromString('Internal Server Error'),
      })
    }
  }

  private async handleNotFound(
    socket: ITcpSocket,
    _request: HttpRequest,
    _urlPath: string,
    extraHeaders: Map<string, string>,
  ): Promise<void> {
    // SPA mode: serve index.html for missing paths
    if (this.spa) {
      const indexPath = this.root + '/index.html'
      if (await this.fs.exists(indexPath)) {
        const stat = await this.fs.stat(indexPath)
        return this.serveFile(socket, _request, indexPath, stat.size, stat.mtime, extraHeaders)
      }
    }

    extraHeaders.set('content-type', 'text/plain; charset=utf-8')
    sendResponse(socket, {
      status: 404,
      statusText: STATUS_TEXT[404],
      headers: extraHeaders,
      body: fromString('Not Found'),
    })
  }

  private async serveFile(
    socket: ITcpSocket,
    request: HttpRequest,
    filePath: string,
    fileSize: number,
    mtime: Date,
    extraHeaders: Map<string, string>,
  ): Promise<void> {
    const mimeType = getMimeType(filePath)
    extraHeaders.set('content-type', mimeType)
    extraHeaders.set('last-modified', mtime.toUTCString())
    extraHeaders.set('etag', `"${mtime.getTime().toString(36)}-${fileSize.toString(36)}"`)

    // Check If-None-Match
    const ifNoneMatch = request.headers.get('if-none-match')
    const etag = extraHeaders.get('etag')
    if (ifNoneMatch && etag && ifNoneMatch === etag) {
      sendResponse(socket, {
        status: 304,
        statusText: STATUS_TEXT[304],
        headers: extraHeaders,
      })
      return
    }

    // HEAD: send headers only
    if (request.method === 'HEAD') {
      extraHeaders.set('content-length', String(fileSize))
      sendResponse(socket, {
        status: 200,
        statusText: STATUS_TEXT[200],
        headers: extraHeaders,
      })
      return
    }

    // Stream file
    const handle = await this.fs.open(filePath, 'r')
    try {
      await sendFileResponse(
        socket,
        { status: 200, statusText: STATUS_TEXT[200], headers: extraHeaders },
        handle,
        fileSize,
      )
    } finally {
      await handle.close()
    }
  }
}

/**
 * Decode request URL to a filesystem-safe path.
 * Returns null if the URL is malformed.
 */
function decodeRequestPath(url: string): string | null {
  try {
    // Strip query string and fragment
    const pathPart = url.split('?')[0].split('#')[0]

    // Decode percent-encoded chars
    const decoded = decodeURIComponent(pathPart)

    // Normalize: collapse double slashes, resolve . and ..
    const segments = decoded.split('/').filter(Boolean)
    const resolved: string[] = []
    for (const seg of segments) {
      if (seg === '.') continue
      if (seg === '..') {
        resolved.pop()
        continue
      }
      resolved.push(seg)
    }

    return '/' + resolved.join('/')
  } catch {
    return null
  }
}
