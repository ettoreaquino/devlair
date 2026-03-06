#!/usr/bin/env bash
# devlair installer
# Usage: curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash
set -euo pipefail

REPO="ettoreaquino/devlair"
BIN="devlair"
INSTALL_DIR="/usr/local/bin"

# ── Detect architecture ───────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)          SUFFIX="linux-x86_64"  ;;
  aarch64 | arm64) SUFFIX="linux-aarch64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# ── Fetch latest release tag ──────────────────────────────────────────────────
echo "Fetching latest devlair release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")

if [[ -z "$LATEST" ]]; then
  echo "Could not determine latest version. Check your internet connection."
  exit 1
fi

echo "Installing devlair ${LATEST} (${SUFFIX})..."

# ── Download binary ───────────────────────────────────────────────────────────
URL="https://github.com/${REPO}/releases/download/${LATEST}/${BIN}-${SUFFIX}"
TMP=$(mktemp)
curl -fsSL "$URL" -o "$TMP"
chmod +x "$TMP"

# ── Install (sudo if needed) ──────────────────────────────────────────────────
if [[ -w "$INSTALL_DIR" ]]; then
  mv "$TMP" "${INSTALL_DIR}/${BIN}"
else
  sudo mv "$TMP" "${INSTALL_DIR}/${BIN}"
fi

echo ""
echo "devlair ${LATEST} installed to ${INSTALL_DIR}/${BIN}"
echo ""
echo "Next step:"
echo "  sudo devlair init"
echo ""
