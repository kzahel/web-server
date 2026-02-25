# 200 OK Web Server

Read [docs/vision.md](docs/vision.md) first — it explains what we're building, why, and the phased roadmap.

## Quick Context

Lightweight web server app for every platform. Successor to "Web Server for Chrome" (200k+ users). First app built on the Transistor pattern (TypeScript engine + native I/O adapters). Desktop will be Tauri (same as JSTorrent).

Currently in **Phase 0**: CLI server that replaces `python -m http.server`.

## Architecture

Monorepo with pnpm workspaces:

- `packages/engine` — Platform-agnostic HTTP server. Adapter pattern: abstract interfaces for socket/filesystem, concrete adapters per platform. This is the core.
- `packages/cli` — Thin CLI wrapper using the engine with Node.js adapters.

The engine must stay platform-agnostic. No Node.js imports in engine code outside of `adapters/node/`.

## Cross-Project Context

This project is part of a larger ecosystem. See `~/code/dotfiles/projects/README.md` for the full map. Key relationships:

- **Transistor** (`~/code/transistor`) — The framework vision this app proves out
- **JSTorrent** (`~/code/jstorrent`) — Shipped product that proved the adapter pattern works (same IFileSystem/IFileHandle approach, QuickJS+JNI on Android, Tauri on desktop)

## Stack

- TypeScript, pnpm workspaces
- Biome for linting and formatting (`pnpm lint`, `pnpm format`)
- Vitest for testing (`pnpm test`)
- `pnpm typecheck` for type checking

## Conventions

- No `Co-Authored-By` lines referencing Claude/AI/Anthropic in commits
- No "Generated with Claude Code" attribution
- Run `pnpm lint` before committing
