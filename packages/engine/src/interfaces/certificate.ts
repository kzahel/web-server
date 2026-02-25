/**
 * TLS certificate and private key, both in PEM format as raw bytes.
 */
export interface TlsOptions {
  cert: Uint8Array;
  key: Uint8Array;
}

/**
 * Platform-specific certificate generation.
 * Each platform implements this using its native crypto:
 *  - Node.js: node:crypto
 *  - Android: Java KeyPairGenerator via JNI
 *  - Tauri: rcgen crate
 */
export interface ICertificateProvider {
  generateSelfSigned(options?: {
    /** Subject Alternative Names (defaults to ["localhost", "127.0.0.1"]) */
    san?: string[];
    /** Validity in days (default: 365) */
    validityDays?: number;
  }): Promise<TlsOptions>;
}
