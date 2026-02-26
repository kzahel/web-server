#!/bin/bash
set -e

# Kill any stale processes
fuser -k 4444/tcp 2>/dev/null || true
fuser -k 4445/tcp 2>/dev/null || true
sleep 1

# Start tauri-driver
echo "Starting tauri-driver..."
~/.cargo/bin/tauri-driver &
TD_PID=$!
sleep 2

echo "=== STATUS ==="
curl -sf http://127.0.0.1:4444/status && echo ""

echo "=== Creating session ==="
timeout 15 curl -s -X POST http://127.0.0.1:4444/session \
  -H 'Content-Type: application/json' \
  -d "{\"capabilities\":{\"alwaysMatch\":{\"tauri:options\":{\"application\":\"/home/kgraehl/code/web-server/desktop/target/debug/ok200-desktop\"}}}}" 2>&1
echo ""

echo "=== Done ==="
kill $TD_PID 2>/dev/null
wait $TD_PID 2>/dev/null || true
