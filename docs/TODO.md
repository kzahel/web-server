# TODO

## High Priority

- [x] **HTTP/1.1 keep-alive** — Loop `handleConnection` instead of closing after one response. Respect `Connection: close`, add idle timeout (~5s). Big perf win for browsers loading many assets.
- [x] **Range requests** — `Range` / `Content-Range` headers, 206 Partial Content. Required for video/audio seek and resumable downloads.
- [ ] **Gzip/Brotli compression** — `Accept-Encoding` negotiation, compress text responses (HTML, CSS, JS, JSON). Also serve precompressed `.gz`/`.br` files when present.
- [ ] **File upload (PUT/POST)** — Optional `--upload` flag and backend streaming upload support are done. Remaining: drag-and-drop upload UI in directory listing page (currently static HTML table with no JS).
- [ ] **Dead code cleanup** — Remove unused stubs: `EngineComponent`, `TokenBucket` (unwired), `IFileHandle.write`/`truncate`/`sync` (read-only server), `ITcpSocket.secure()`/`isSecure` (no HTTPS yet).
