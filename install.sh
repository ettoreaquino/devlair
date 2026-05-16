#!/usr/bin/env bash
# devlair installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash -s -- --pre
#
# Channels:
#   stable   Latest v1 release (Python). Default.
#   --pre    Latest v2 alpha (TypeScript + Ink). Preview — see breaking changes below.
set -euo pipefail

REPO="ettoreaquino/devlair"
BIN="devlair"
INSTALL_DIR="/usr/local/bin"
SHARE_DIR="/usr/local/share/devlair"
CHANNEL="stable"

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --pre)    CHANNEL="pre" ;;
    --stable) CHANNEL="stable" ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

# ── Detect architecture ───────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)          ARCH_SUFFIX="x86_64"  ;;
  aarch64 | arm64) ARCH_SUFFIX="aarch64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

# ── Channel configuration ─────────────────────────────────────────────────────
if [[ "$CHANNEL" == "pre" ]]; then
  ASSET_PREFIX="devlair-cli"
  echo "Fetching latest devlair v2 alpha release..."
  # GitHub's /releases/latest endpoint excludes prereleases, so list and filter.
  LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=30" \
    | grep -o '"tag_name": *"devlair-cli-v[^"]*"' \
    | head -1 \
    | sed -E 's/.*"(devlair-cli-v[^"]*)"/\1/')
else
  ASSET_PREFIX="devlair"
  echo "Fetching latest devlair release..."
  LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -o '"tag_name": *"[^"]*"' | head -1 \
    | grep -o '"v[^"]*"' | tr -d '"')
fi

if [[ -z "${LATEST:-}" ]]; then
  echo "Could not determine latest version. Check your internet connection." >&2
  exit 1
fi

ASSET="${ASSET_PREFIX}-linux-${ARCH_SUFFIX}"
echo "Installing ${ASSET} from release ${LATEST}..."

# ── Download binary + checksums ───────────────────────────────────────────────
BASE_URL="https://github.com/${REPO}/releases/download/${LATEST}"
TMP=$(mktemp)
TMP_CHECKSUMS=$(mktemp)
curl -fsSL "${BASE_URL}/${ASSET}" -o "$TMP"
curl -fsSL "${BASE_URL}/checksums.txt" -o "$TMP_CHECKSUMS"

# ── Verify SHA-256 checksum ──────────────────────────────────────────────────
EXPECTED=$(grep " ${ASSET}\$" "$TMP_CHECKSUMS" | awk '{print $1}')
ACTUAL=$(sha256sum "$TMP" | awk '{print $1}')

if [[ -z "$EXPECTED" ]]; then
  echo "WARNING: No checksum found for ${ASSET} — skipping verification."
elif [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "ERROR: Checksum mismatch!" >&2
  echo "  Expected: ${EXPECTED}" >&2
  echo "  Got:      ${ACTUAL}" >&2
  rm -f "$TMP"
  exit 1
else
  echo "✓ SHA-256 verified"
fi

chmod 755 "$TMP"

# ── Install (sudo if needed) ──────────────────────────────────────────────────
if [[ -w "$INSTALL_DIR" ]]; then
  mv "$TMP" "${INSTALL_DIR}/${BIN}"
else
  sudo mv "$TMP" "${INSTALL_DIR}/${BIN}"
fi
chmod 755 "${INSTALL_DIR}/${BIN}" 2>/dev/null || sudo chmod 755 "${INSTALL_DIR}/${BIN}"

# ── Pre-release: fetch modules tarball ────────────────────────────────────────
# v2 shell modules live outside the compiled binary and ship as a separate
# tarball. v1 (stable) is self-contained and does not need this step.
if [[ "$CHANNEL" == "pre" ]]; then
  TMP_MODULES=$(mktemp)
  echo "Fetching modules tarball..."
  curl -fsSL "${BASE_URL}/modules.tar.gz" -o "$TMP_MODULES"

  EXPECTED_MODULES=$(grep " modules.tar.gz\$" "$TMP_CHECKSUMS" | awk '{print $1}')
  ACTUAL_MODULES=$(sha256sum "$TMP_MODULES" | awk '{print $1}')

  if [[ -z "$EXPECTED_MODULES" ]]; then
    echo "WARNING: No checksum found for modules.tar.gz — skipping verification."
  elif [[ "$ACTUAL_MODULES" != "$EXPECTED_MODULES" ]]; then
    echo "ERROR: Checksum mismatch for modules.tar.gz!" >&2
    echo "  Expected: ${EXPECTED_MODULES}" >&2
    echo "  Got:      ${ACTUAL_MODULES}" >&2
    rm -f "$TMP_MODULES"
    exit 1
  else
    echo "✓ modules.tar.gz SHA-256 verified"
  fi

  # Replace the modules dir atomically: extract to a staging path, then swap.
  STAGE_DIR=$(mktemp -d)
  tar -xzf "$TMP_MODULES" -C "$STAGE_DIR"
  rm -f "$TMP_MODULES"

  if [[ -w "$(dirname "$SHARE_DIR")" ]]; then
    rm -rf "${SHARE_DIR}.old" 2>/dev/null || true
    [[ -d "$SHARE_DIR" ]] && mv "$SHARE_DIR" "${SHARE_DIR}.old"
    mkdir -p "$SHARE_DIR"
    mv "$STAGE_DIR/modules" "${SHARE_DIR}/modules"
    rm -rf "${SHARE_DIR}.old" "$STAGE_DIR"
  else
    sudo rm -rf "${SHARE_DIR}.old" 2>/dev/null || true
    [[ -d "$SHARE_DIR" ]] && sudo mv "$SHARE_DIR" "${SHARE_DIR}.old"
    sudo mkdir -p "$SHARE_DIR"
    sudo mv "$STAGE_DIR/modules" "${SHARE_DIR}/modules"
    sudo rm -rf "${SHARE_DIR}.old"
    rm -rf "$STAGE_DIR"
  fi

  echo "✓ modules installed to ${SHARE_DIR}/modules"
fi

rm -f "$TMP_CHECKSUMS"

echo ""
echo "✓ devlair ${LATEST} installed to ${INSTALL_DIR}/${BIN}"
echo ""

# ── Channel-specific post-install notice ──────────────────────────────────────
if [[ "$CHANNEL" == "pre" ]]; then
  cat <<'NOTICE'
⚠  You installed a v2 alpha. The following v1 commands have been REMOVED:

    devlair sync         — pin to v1 or run `rclone bisync` directly
    devlair filesystem   — not ported
    devlair claw         — not ported

Report issues: https://github.com/ettoreaquino/devlair/issues

NOTICE
fi

echo "Next step:"
echo "  devlair init"
echo ""
