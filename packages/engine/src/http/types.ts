export interface HttpRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: Map<string, string>;
  body?: Uint8Array;
}

export interface HttpResponseOptions {
  status: number;
  statusText: string;
  headers?: Map<string, string> | Record<string, string>;
  body?: Uint8Array;
}

export const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  204: "No Content",
  206: "Partial Content",
  301: "Moved Permanently",
  304: "Not Modified",
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  413: "Content Too Large",
  500: "Internal Server Error",
};
