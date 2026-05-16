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

  # Modules ship a fresh tree on every release — a missing checksum entry
  # means CI is misconfigured, not a soft warning. Hard-fail rather than
  # extract an unverified archive and execute its scripts as root.
  if [[ -z "$EXPECTED_MODULES" ]]; then
    echo "ERROR: No checksum entry for modules.tar.gz in checksums.txt — aborting." >&2
    rm -f "$TMP_MODULES"
    exit 1
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
  # --no-same-owner / --no-same-permissions ignore uid/gid/mode bits from the
  # archive so a future tampered tarball can't plant setuid bits or odd owners
  # under sudo; chmod immediately after pins a known-safe mode regardless of
  # the installer's umask.
  STAGE_DIR=$(mktemp -d)
  tar -xzf "$TMP_MODULES" -C "$STAGE_DIR" --no-same-owner --no-same-permissions
  chmod -R u=rwX,go=rX "$STAGE_DIR/modules"
  rm -f "$TMP_MODULES"

  MAYBE_SUDO=""
  [[ ! -w "$(dirname "$SHARE_DIR")" ]] && MAYBE_SUDO="sudo"

  $MAYBE_SUDO rm -rf "${SHARE_DIR}.old" 2>/dev/null || true
  [[ -d "$SHARE_DIR" ]] && $MAYBE_SUDO mv "$SHARE_DIR" "${SHARE_DIR}.old"
  $MAYBE_SUDO mkdir -m 755 -p "$SHARE_DIR"
  $MAYBE_SUDO mv "$STAGE_DIR/modules" "${SHARE_DIR}/modules"
  $MAYBE_SUDO chmod 755 "${SHARE_DIR}/modules"
  $MAYBE_SUDO rm -rf "${SHARE_DIR}.old"
  rm -rf "$STAGE_DIR"

  echo "✓ modules installed to ${SHARE_DIR}/modules"

  # ── Pre-release: repair WSL-specific broken dpkg state (Debian-like) ──────
  # Ubuntu 24.04 WSL ships with openssh-server half-configured: its postinst
  # calls `systemctl restart ssh`, but systemd isn't running by default on
  # WSL, so the postinst exits 1 and dpkg leaves the package broken. After
  # that, every `apt-get install` fails with a misleading trailing
  # `E: Sub-process /usr/bin/dpkg returned an error code (1)` regardless of
  # what package is being installed — poisoning devlair's apt-using modules.
  # Scoped to WSL so we don't purge a legitimately-running openssh-server
  # on a bare Linux server (which would lock out remote operators).
  if grep -qi microsoft /proc/version 2>/dev/null && command -v dpkg-query >/dev/null 2>&1; then
    ssh_status=$(dpkg-query -W -f='${Status}' openssh-server 2>/dev/null || true)
    if [[ -n "$ssh_status" && "$ssh_status" != "install ok installed" ]]; then
      echo "Repairing pre-existing openssh-server half-config..."
      $MAYBE_SUDO apt-get purge -y -qq openssh-server >/dev/null 2>&1 || true
    fi
    $MAYBE_SUDO dpkg --configure -a >/dev/null 2>&1 || true
  fi

  # ── Pre-release: bootstrap runtime deps ────────────────────────────────────
  # modules/_lib.sh hard-requires jq for context parsing; on a fresh Ubuntu
  # the binary installs cleanly but every `devlair init` step exits 1 before
  # emitting any output. Install jq up-front so the first wizard run works.
  if ! command -v jq >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      echo "Installing runtime dep: jq..."
      $MAYBE_SUDO apt-get update -qq >/dev/null
      $MAYBE_SUDO apt-get install -y -qq jq >/dev/null
      echo "✓ jq installed"
    else
      echo "WARNING: jq is required by devlair modules but apt-get is not available." >&2
      echo "Install jq manually before running 'devlair init'." >&2
    fi
  fi
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
