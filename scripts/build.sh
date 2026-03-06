#!/usr/bin/env bash
# Build a local devlair binary using PyInstaller
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Installing dependencies..."
uv sync --group dev

echo "Building binary..."
uv run pyinstaller \
  --onefile \
  --name devlair \
  --strip \
  devlair/cli.py

ARCH=$(uname -m)
mv dist/devlair "dist/devlair-linux-${ARCH}"
echo "Binary: dist/devlair-linux-${ARCH}"
