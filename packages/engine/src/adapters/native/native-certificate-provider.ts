import type {
  ICertificateProvider,
  TlsOptions,
} from "../../interfaces/certificate.js";

export class NativeCertificateProvider implements ICertificateProvider {
  async generateSelfSigned(options?: {
    san?: string[];
    validityDays?: number;
  }): Promise<TlsOptions> {
    const san = options?.san ?? ["localhost", "127.0.0.1"];
    const validityDays = options?.validityDays ?? 365;

    const resultJson = __ok200_tls_generate_self_signed(
      JSON.stringify(san),
      String(validityDays),
    );

    const result = JSON.parse(resultJson) as { cert: string; key: string };
    const encoder = new TextEncoder();

    return {
      cert: encoder.encode(result.cert),
      key: encoder.encode(result.key),
    };
  }
}
