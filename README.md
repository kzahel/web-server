# ok200

Lightweight static file server. Replaces `python -m http.server`.

## Usage

```sh
ok200                          # serve current directory on port 8080
ok200 ./dist                   # serve a specific directory
ok200 --port 3000              # custom port
ok200 --host 0.0.0.0           # expose on LAN
ok200 ./dist --spa --cors      # SPA mode with CORS headers
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port, -p <port>` | Port to listen on | `8080` |
| `--host, -H <host>` | Host to bind | `127.0.0.1` |
| `--cors` | Enable CORS headers | off |
| `--spa` | Serve index.html for missing paths | off |
| `--no-listing` | Disable directory listing | off |
| `--quiet, -q` | Suppress request logging | off |
| `--help, -h` | Show help | |

## Features

- Static file serving with MIME type detection
- Auto-serves index.html for directories
- Directory listing with file sizes and dates
- ETag / If-None-Match (304) support
- Path traversal protection
- Graceful shutdown on SIGINT/SIGTERM

## Development

```sh
pnpm install
pnpm build       # compile TypeScript
pnpm test        # run unit + e2e tests
pnpm typecheck   # type check
pnpm lint        # lint with Biome
```

### Architecture

Monorepo with two packages:

- `packages/engine` — Platform-agnostic HTTP server with adapter pattern
- `packages/cli` — CLI wrapper using the engine with Node.js adapters

See [docs/vision.md](docs/vision.md) for the full vision and roadmap.
