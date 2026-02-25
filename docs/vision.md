# 200 OK Web Server

## What This Is

A lightweight web server app for every platform. Successor to "Web Server for Chrome" (~200k users). The original was a Chrome App; Chrome Apps were deprecated. A fork called "Simple Web Server" went Electron. We're doing it right: small, fast, native.

This is also the first app built on the Transistor pattern — TypeScript engine, native I/O, every platform. See `~/code/transistor/docs/vision.md` for the framework vision.

## Architecture

### Engine + Shell

The HTTP server is a platform-agnostic TypeScript engine (`packages/engine`) with an adapter pattern for I/O. Platform-specific shells provide the actual sockets and filesystem.

```
packages/engine/          TypeScript HTTP server engine (no platform deps)
  interfaces/             Abstract I/O: socket, filesystem
  adapters/node/          Node.js adapter (used by CLI today)
  http/                   Request parser, response writer
  server/                 Static server, directory listing, MIME types
  config/                 Server configuration

packages/cli/             CLI shell (Node.js, ships standalone)
```

This is the same adapter pattern proven in JSTorrent — one engine, multiple I/O backends.

### Platform Targets

| Platform | Shell | Runtime | Status |
|----------|-------|---------|--------|
| CLI | Node.js process | Node.js | In progress |
| Desktop (Mac/Win/Linux) | Tauri | Rust backend + webview | Planned |
| Android / ChromeOS | Native app | QuickJS + JNI | Planned |
| iOS | Native app | System JSC | Future |

Desktop uses Tauri (same as JSTorrent). ~5-15MB install vs ~100MB+ Electron. The HTTP server logic is always TypeScript — Rust only provides the native I/O layer (sockets, filesystem) that the JS engine calls into. Same principle on every platform: native code exposes I/O primitives, TypeScript does everything else.

### Why This Order

CLI first because it's the fastest iteration loop — no GUI overhead, just serve files. Tauri desktop second because we've done it before (JSTorrent). Android third because QuickJS+JNI is proven (JSTorrent). iOS last.

## Roadmap

### Phase 0: CLI Server (current)

`200ok serve .` should just work. Replace `python -m http.server` and `npx serve`.

- Serve static files from a directory (default: cwd)
- `--port` (default: 8080), `--host` (default: 127.0.0.1)
- Directory listing when no index.html
- Auto-serve index.html
- MIME type detection
- `--cors`, `--spa` flags
- Request logging
- Graceful shutdown

### Phase 0.5: Tauri Desktop Shell

Wrap the engine in a Tauri app with minimal UI:

- Directory picker
- Port input, start/stop button
- Clickable server URL
- Request log viewer
- LAN / CORS / SPA toggles

### Phase 1: Feature Parity with Original Chrome App

- HTTPS with self-signed cert generation
- HTTP Basic Auth
- File upload (PUT)
- Range requests (media streaming)
- IPv6

### Phase 2: Quality of Life

- Multiple simultaneous servers
- Clean URLs (strip .html)
- Precompressed file serving (.gz/.br)
- Cache-Control config
- Hidden/dot file toggles
- System tray / background mode

### Phase 3: Differentiation

Features neither the original nor Simple Web Server has:

- QR code for mobile access (LAN URL)
- Live reload (file watching + browser refresh)
- Reverse proxy (`--proxy /api=http://localhost:8080`)
- Custom response headers
- Drag-and-drop upload in browser UI
- .gitignore respect

## Competitive Position

| | Us | Simple Web Server | CLI tools (serve, miniserve) |
|---|---|---|---|
| Install size | 5-15MB (Tauri) | 100MB+ (Electron) | Varies |
| Mobile | Android + ChromeOS | No | No |
| Performance | Rust/native | Node.js | Varies |
| GUI | Yes (Tauri) | Yes (Electron) | No |

Key gaps we fill: ChromeOS/Android (nobody else does this), lightweight desktop (Tauri not Electron), and the existing user base (~2k emails from Chrome extension migration).

## Research

Detailed competitive analysis in `docs/research/`:

- `feature-comparison.md` — Web Server for Chrome vs Simple Web Server feature matrix
- `competitive-landscape.md` — Market positioning and distribution strategy
- `cli-servers-comparison.md` — CLI server landscape (miniserve, dufs, serve, http-server, etc.)
- `feature-roadmap-ideas.md` — Full feature brainstorm with architecture notes
