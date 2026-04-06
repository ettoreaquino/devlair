#!/usr/bin/env bash
# devlair installer
# Usage: curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
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

# ── Download binary + checksums ───────────────────────────────────────────────
BASE_URL="https://github.com/${REPO}/releases/download/${LATEST}"
TMP=$(mktemp)
TMP_CHECKSUMS=$(mktemp)
curl -fsSL "${BASE_URL}/${BIN}-${SUFFIX}" -o "$TMP"
curl -fsSL "${BASE_URL}/checksums.txt" -o "$TMP_CHECKSUMS"

# ── Verify SHA-256 checksum ──────────────────────────────────────────────────
EXPECTED=$(grep "${BIN}-${SUFFIX}" "$TMP_CHECKSUMS" | awk '{print $1}')
ACTUAL=$(sha256sum "$TMP" | awk '{print $1}')
rm -f "$TMP_CHECKSUMS"

if [[ -z "$EXPECTED" ]]; then
  echo "WARNING: No checksum found for ${BIN}-${SUFFIX} — skipping verification."
elif [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "ERROR: Checksum mismatch!"
  echo "  Expected: ${EXPECTED}"
  echo "  Got:      ${ACTUAL}"
  rm -f "$TMP"
  exit 1
else
  echo "✓ SHA-256 verified"
fi

chmod +x "$TMP"

# ── Install (sudo if needed) ──────────────────────────────────────────────────
if [[ -w "$INSTALL_DIR" ]]; then
  mv "$TMP" "${INSTALL_DIR}/${BIN}"
else
  sudo mv "$TMP" "${INSTALL_DIR}/${BIN}"
fi

echo ""
echo "✓ devlair ${LATEST} installed to ${INSTALL_DIR}/${BIN}"
echo ""
echo "Next step:"
echo "  devlair init"
echo ""
