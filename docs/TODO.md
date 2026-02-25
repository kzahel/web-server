# TODO

## High Priority

- [x] **HTTP/1.1 keep-alive** — Loop `handleConnection` instead of closing after one response. Respect `Connection: close`, add idle timeout (~5s). Big perf win for browsers loading many assets.
- [ ] **Range requests** — `Range` / `Content-Range` headers, 206 Partial Content. Required for video/audio seek and resumable downloads.
- [ ] **Gzip/Brotli compression** — `Accept-Encoding` negotiation, compress text responses (HTML, CSS, JS, JSON). Also serve precompressed `.gz`/`.br` files when present.
- [ ] **File upload (PUT/POST)** — Optional `--upload` flag. Accept file uploads to the served directory. Stream request body directly to disk (constant memory, no size limit). Add drag-and-drop upload UI to directory listing page (currently static HTML table with no JS).
- [ ] **Dead code cleanup** — Remove unused stubs: `EngineComponent`, `TokenBucket` (unwired), `IFileHandle.write`/`truncate`/`sync` (read-only server), `ITcpSocket.secure()`/`isSecure` (no HTTPS yet).
