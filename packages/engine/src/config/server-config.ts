import type { TlsOptions } from "../interfaces/certificate.js";

export interface ServerConfig {
  /** Port to listen on. Default: 8080 */
  port: number;
  /** Host/IP to bind. Default: '127.0.0.1' */
  host: string;
  /** Root directory to serve. */
  root: string;
  /** Enable CORS headers. Default: false */
  cors: boolean;
  /** SPA mode: rewrite 404s to index.html. Default: false */
  spa: boolean;
  /** Show directory listings. Default: true */
  directoryListing: boolean;
  /** Suppress request logging. Default: false */
  quiet: boolean;
  /** Enable file uploads via PUT/POST. Default: false */
  upload: boolean;
  /** Max time allowed for receiving a full HTTP request. Default: 5000ms */
  requestTimeoutMs: number;
  /** Max buffered request body size for non-streaming handlers. Default: 10MB */
  maxRequestBodySize: number;
  /** TLS options. When set, the server listens for HTTPS. */
  tls?: TlsOptions;
}

export function defaultConfig(root: string): ServerConfig {
  return {
    port: 8080,
    host: "127.0.0.1",
    root,
    cors: false,
    spa: false,
    directoryListing: true,
    quiet: false,
    upload: false,
    requestTimeoutMs: 5000,
    maxRequestBodySize: 10 * 1024 * 1024,
  };
}
