#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CARGO_BIN="$HOME/.cargo/bin"
TAURI_DRIVER="$CARGO_BIN/tauri-driver"

cleanup() {
  if [ -n "${TD_PID:-}" ]; then
    kill "$TD_PID" 2>/dev/null || true
    wait "$TD_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Kill any stale processes from a previous run
pkill -9 -f tauri-driver 2>/dev/null || true
pkill -9 -f ok200-desktop 2>/dev/null || true
pkill -9 -f WebKitWebDriver 2>/dev/null || true
sleep 1

# Start tauri-driver in the background
"$TAURI_DRIVER" &
TD_PID=$!

# Wait for tauri-driver to be ready
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4444/status >/dev/null 2>&1; then
    echo "tauri-driver ready on port 4444 (PID $TD_PID)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: tauri-driver failed to start within 15s" >&2
    exit 1
  fi
  sleep 0.5
done

# Run WebdriverIO tests
cd "$SCRIPT_DIR"
npx wdio run wdio.conf.ts "$@"
