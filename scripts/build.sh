#!/usr/bin/env bash
# Build a local devlair binary using PyInstaller
# Usage: ./scripts/build.sh [version]
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-$(git describe --tags --always 2>/dev/null || echo dev)}"
VERSION="${VERSION#v}"
echo "Version: ${VERSION}"
sed -i "s/__version__ = \"0.0.0.dev0\"/__version__ = \"${VERSION}\"/" devlair/__init__.py

echo "Installing dependencies..."
uv sync --group dev

echo "Building binary..."
uv run pyinstaller \
  --onefile \
  --name devlair \
  --strip \
  devlair/cli.py

# Restore dev marker
git checkout devlair/__init__.py 2>/dev/null || true

ARCH=$(uname -m)
mv dist/devlair "dist/devlair-linux-${ARCH}"
echo "Binary: dist/devlair-linux-${ARCH}"
