#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$SCRIPT_DIR/../src-tauri"
DESKTOP_DIR="$SCRIPT_DIR/../.."
BINARIES_DIR="$TAURI_DIR/binaries"

# Determine target triple
if [ -n "${TARGET_TRIPLE:-}" ]; then
  TRIPLE="$TARGET_TRIPLE"
elif [ -n "${TAURI_ENV_TARGET_TRIPLE:-}" ]; then
  TRIPLE="$TAURI_ENV_TARGET_TRIPLE"
else
  TRIPLE="$(rustc -vV | grep '^host:' | cut -d' ' -f2)"
fi

echo "prepare-sidecar: triple=$TRIPLE"

HOST_BIN="ok200-host"
EXT=""
if [[ "$TRIPLE" == *windows* ]]; then
  EXT=".exe"
fi

mkdir -p "$BINARIES_DIR"

# In CI, the sidecar may already be built (cross-compile). Skip rebuild if present.
DEST="$BINARIES_DIR/${HOST_BIN}-${TRIPLE}${EXT}"
if [ -f "$DEST" ] && [ "${CI:-}" = "true" ]; then
  echo "prepare-sidecar: $DEST already exists (CI), skipping build"
  exit 0
fi

# Build the host binary
echo "prepare-sidecar: building $HOST_BIN..."
TARGET_FLAG=""
if [ -n "${TARGET_TRIPLE:-}" ]; then
  TARGET_FLAG="--target $TARGET_TRIPLE"
fi

(cd "$DESKTOP_DIR" && cargo build --release -p "$HOST_BIN" $TARGET_FLAG)

# Find the built binary
if [ -n "${TARGET_TRIPLE:-}" ]; then
  SRC="$DESKTOP_DIR/target/${TARGET_TRIPLE}/release/${HOST_BIN}${EXT}"
else
  SRC="$DESKTOP_DIR/target/release/${HOST_BIN}${EXT}"
fi

if [ ! -f "$SRC" ]; then
  echo "prepare-sidecar: ERROR: built binary not found at $SRC"
  exit 1
fi

cp "$SRC" "$DEST"
echo "prepare-sidecar: copied $SRC -> $DEST"

# Also copy without triple suffix for dev
cp "$SRC" "$BINARIES_DIR/${HOST_BIN}${EXT}"

# On macOS, re-sign the copied binary (loses ad-hoc signature when copied)
if [[ "$(uname)" == "Darwin" ]]; then
  codesign --force --sign - "$DEST" 2>/dev/null || true
  codesign --force --sign - "$BINARIES_DIR/${HOST_BIN}${EXT}" 2>/dev/null || true
  echo "prepare-sidecar: re-signed binaries"
fi

echo "prepare-sidecar: done"
