#!/usr/bin/env bash
# devlair installer
#
# Usage (Linux / WSL):
#   curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
#
# Usage (macOS):
#   curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash
#
# The script auto-elevates only when /usr/local/bin is not writable.
# On macOS with Homebrew, sudo is usually not required.
set -euo pipefail

REPO="ettoreaquino/devlair"
BIN="devlair"
INSTALL_DIR="/usr/local/bin"
SHARE_DIR="/usr/local/share/devlair"
CHANNEL="v2"

# Computed after we know INSTALL_DIR — reused for binary install, modules
# install, and any apt-get fallbacks below so the sudo decision is made once.
MAYBE_SUDO=""
[[ ! -w "$INSTALL_DIR" ]] && MAYBE_SUDO="sudo"

# ── Dracula-styled output ─────────────────────────────────────────────────────
# Keep in sync with Dracula palette (cli/src/lib/theme.ts) — drift produces
# off-brand output. Auto-disable on non-TTY or when NO_COLOR is set so
# piped/CI output stays clean.
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_PURPLE=$'\033[38;2;189;147;249m'
  C_PINK=$'\033[38;2;255;121;198m'
  C_GREEN=$'\033[38;2;80;250;123m'
  C_ORANGE=$'\033[38;2;255;184;108m'
  C_RED=$'\033[38;2;255;85;85m'
  C_CYAN=$'\033[38;2;139;233;253m'
  C_COMMENT=$'\033[38;2;98;114;164m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_PURPLE="" C_PINK="" C_GREEN="" C_ORANGE="" C_RED="" C_CYAN="" C_COMMENT="" C_BOLD="" C_RESET=""
fi

section() { printf "%s▸%s %s%s%s\n" "$C_PURPLE" "$C_RESET" "$C_BOLD" "$1" "$C_RESET"; }
ok()      { printf "  %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn()    { printf "  %s!%s %s\n" "$C_ORANGE" "$C_RESET" "$1"; }
err()     { printf "  %s✗%s %s\n" "$C_RED" "$C_RESET" "$1" >&2; }
meta()    { printf "    %s%s%s\n" "$C_COMMENT" "$1" "$C_RESET"; }

# verify_checksum <file> <asset_name> <checksums_file> <hard_fail_on_missing>
# Compares sha256 of <file> against the entry for <asset_name> in <checksums_file>.
# When <hard_fail_on_missing> is "1", a missing entry aborts; otherwise it warns
# and continues. Mismatches always abort. Removes <file> on failure.
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

verify_checksum() {
  local file="$1" asset="$2" sums="$3" hard_fail="$4"
  local expected actual
  expected=$(grep " ${asset}\$" "$sums" | awk '{print $1}')
  actual=$(sha256 "$file" | awk '{print $1}')

  if [[ -z "$expected" ]]; then
    if [[ "$hard_fail" == "1" ]]; then
      err "no checksum entry for ${asset} in checksums.txt — aborting"
      rm -f "$file"
      exit 1
    fi
    warn "no checksum found for ${asset} — skipping verification"
    return 0
  fi

  if [[ "$actual" != "$expected" ]]; then
    err "checksum mismatch for ${asset}!"
    meta "expected: ${expected}"
    meta "got:      ${actual}"
    rm -f "$file"
    exit 1
  fi

  ok "SHA-256 verified"
}

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --v1)    CHANNEL="v1" ;;
    --pre)   ;;                # no-op: v2 is now the default
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      err "Unknown option: $arg"
      err "Run with --help for usage."
      exit 1
      ;;
  esac
done

# ── Detect OS + architecture ──────────────────────────────────────────────────
OS=$(uname -s)
case "$OS" in
  Linux)  OS_SUFFIX="linux"  ;;
  Darwin) OS_SUFFIX="darwin" ;;
  *)
    err "Unsupported OS: $OS"
    exit 1
    ;;
esac

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)          ARCH_SUFFIX="x86_64"  ;;
  aarch64 | arm64) ARCH_SUFFIX="aarch64" ;;
  *)
    err "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# v1 is Python/PyInstaller — Linux binaries only.
if [[ "$CHANNEL" == "v1" && "$OS_SUFFIX" == "darwin" ]]; then
  err "v1 channel does not support macOS — no Darwin binary is published."
  meta "Use the default channel (v2) for macOS support."
  exit 1
fi

printf "\n%s%s devlair installer%s  %s· channel: %s · os: %s · arch: %s%s\n\n" \
  "$C_BOLD" "$C_PINK" "$C_RESET" "$C_COMMENT" "$CHANNEL" "$OS_SUFFIX" "$ARCH_SUFFIX" "$C_RESET"

# ── Channel configuration ─────────────────────────────────────────────────────
section "Resolving release"
if [[ "$CHANNEL" == "v1" ]]; then
  ASSET_PREFIX="devlair"
  LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=30" \
    | grep -o '"tag_name": *"v1\.[^"]*"' \
    | head -1 \
    | grep -o '"v[^"]*"' | tr -d '"')
  if [[ -n "${LATEST:-}" && ! "$LATEST" =~ ^v[0-9]+\.[0-9]+\.[0-9] ]]; then
    err "Unexpected version format: $LATEST"; exit 1
  fi
else
  ASSET_PREFIX="devlair-cli"
  # Default channel = the latest non-v1 release (v2, v3, …). Don't hardcode a
  # major here, or the installer silently pins to the previous line after a
  # major bump (e.g. v3.0.0 ships but `v2\.` keeps resolving the old v2.x).
  LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=30" \
    | grep -oE '"tag_name": *"v[0-9]+\.[^"]*"' \
    | grep -v '"tag_name": *"v1\.' \
    | head -1 \
    | grep -o '"v[^"]*"' | tr -d '"')
  if [[ -n "${LATEST:-}" && ! "$LATEST" =~ ^v[0-9]+\.[0-9]+\.[0-9] ]]; then
    err "Unexpected version format: $LATEST"; exit 1
  fi
fi

if [[ -z "${LATEST:-}" ]]; then
  err "Could not determine latest version. Check your internet connection."
  exit 1
fi

ASSET="${ASSET_PREFIX}-${OS_SUFFIX}-${ARCH_SUFFIX}"
ok "release ${LATEST}"
meta "asset: ${ASSET}"

# ── Download binary + checksums ───────────────────────────────────────────────
section "Downloading binary"
BASE_URL="https://github.com/${REPO}/releases/download/${LATEST}"
TMP=$(mktemp)
TMP_CHECKSUMS=$(mktemp)
cleanup() { rm -f "${TMP:-}" "${TMP_CHECKSUMS:-}" "${TMP_MODULES:-}"; rm -rf "${STAGE_DIR:-}"; }
trap cleanup EXIT
curl -fsSL "${BASE_URL}/${ASSET}" -o "$TMP"
curl -fsSL "${BASE_URL}/checksums.txt" -o "$TMP_CHECKSUMS"
ok "downloaded ${ASSET}"

# ── Verify SHA-256 checksum ──────────────────────────────────────────────────
# v1: soft-warn on missing entry (pre-existing behavior). Mismatches always abort.
# v2: hard-fail — the release CI always publishes checksums.
if [[ "$CHANNEL" == "v1" ]]; then
  verify_checksum "$TMP" "$ASSET" "$TMP_CHECKSUMS" 0
else
  verify_checksum "$TMP" "$ASSET" "$TMP_CHECKSUMS" 1
fi

chmod 755 "$TMP"

# ── Install (sudo if needed) ──────────────────────────────────────────────────
section "Installing binary"
$MAYBE_SUDO mv "$TMP" "${INSTALL_DIR}/${BIN}"
$MAYBE_SUDO chmod 755 "${INSTALL_DIR}/${BIN}"
ok "${INSTALL_DIR}/${BIN}"

# ── v2: fetch modules tarball ─────────────────────────────────────────────────
# v2 shell modules live outside the compiled binary and ship as a separate
# tarball. v1 is self-contained and does not need this step.
if [[ "$CHANNEL" != "v1" ]]; then
  section "Fetching modules"
  TMP_MODULES=$(mktemp)
  curl -fsSL "${BASE_URL}/modules.tar.gz" -o "$TMP_MODULES"

  # Modules ship a fresh tree on every release — a missing checksum entry
  # means CI is misconfigured, not a soft warning. Hard-fail rather than
  # extract an unverified archive and execute its scripts as root.
  verify_checksum "$TMP_MODULES" "modules.tar.gz" "$TMP_CHECKSUMS" 1

  # Replace the modules dir atomically: extract to a staging path, then swap.
  # --no-same-owner / --no-same-permissions ignore uid/gid/mode bits from the
  # archive so a future tampered tarball can't plant setuid bits or odd owners
  # under sudo; chmod immediately after pins a known-safe mode regardless of
  # the installer's umask.
  STAGE_DIR=$(mktemp -d)
  # --no-same-permissions is GNU tar only; BSD tar (macOS) ignores permissions
  # by default so the flag is not needed there.
  TAR_OPTS=(--no-same-owner)
  [[ "$OS_SUFFIX" == "linux" ]] && TAR_OPTS+=(--no-same-permissions)
  tar -xzf "$TMP_MODULES" -C "$STAGE_DIR" "${TAR_OPTS[@]}"
  chmod -R u=rwX,go=rX "$STAGE_DIR/modules"
  rm -f "$TMP_MODULES"

  $MAYBE_SUDO rm -rf "${SHARE_DIR}.old" 2>/dev/null || true
  [[ -d "$SHARE_DIR" ]] && $MAYBE_SUDO mv "$SHARE_DIR" "${SHARE_DIR}.old"
  $MAYBE_SUDO mkdir -m 755 -p "$SHARE_DIR"
  $MAYBE_SUDO mv "$STAGE_DIR/modules" "${SHARE_DIR}/modules"
  $MAYBE_SUDO chmod 755 "${SHARE_DIR}/modules"
  $MAYBE_SUDO rm -rf "${SHARE_DIR}.old"
  rm -rf "$STAGE_DIR"
  ok "modules installed to ${SHARE_DIR}/modules"

  # ── WSL-specific dpkg state cleanup ──────────────────────────────────────
  # Ubuntu 24.04 WSL ships with openssh-server in a half-configured state:
  # its postinst calls `systemctl restart ssh`, but systemd isn't running by
  # default on WSL, so the postinst exits 1 and dpkg leaves the package in
  # `iU` (unpacked, not configured). After that, every subsequent apt-get
  # install fails with a misleading trailing
  # `E: Sub-process /usr/bin/dpkg returned an error code (1)`, regardless of
  # what package is being installed — poisoning devlair's apt-using modules.
  # Scoped to WSL so we don't purge a legitimately-running openssh-server
  # on a bare Linux server (which would lock out remote operators).
  if grep -qi microsoft /proc/version 2>/dev/null && command -v dpkg-query >/dev/null 2>&1; then
    ssh_status=$(dpkg-query -W -f='${Status}' openssh-server 2>/dev/null || true)
    if [[ -n "$ssh_status" && "$ssh_status" != "install ok installed" ]]; then
      section "Cleaning up Ubuntu WSL dpkg state"
      warn "Ubuntu's openssh-server postinst failed under WSL (no systemd) — removing it so later apt installs succeed"
      $MAYBE_SUDO apt-get purge -y -qq openssh-server >/dev/null 2>&1 || true
      ok "openssh-server cleared"
    fi
    $MAYBE_SUDO dpkg --configure -a >/dev/null 2>&1 || true
  fi

  # ── Bootstrap runtime deps ────────────────────────────────────────────────
  # modules/_lib.sh hard-requires jq for context parsing; on a fresh Ubuntu
  # the binary installs cleanly but every `devlair init` step exits 1 before
  # emitting any output. Install jq up-front so the first wizard run works.
  if ! command -v jq >/dev/null 2>&1; then
    section "Bootstrapping runtime deps"
    if command -v apt-get >/dev/null 2>&1; then
      $MAYBE_SUDO apt-get update -qq >/dev/null
      $MAYBE_SUDO apt-get install -y -qq jq >/dev/null
      ok "jq installed"
    elif command -v brew >/dev/null 2>&1; then
      brew install --quiet jq >/dev/null  # brew must not run as root — no $MAYBE_SUDO
      ok "jq installed"
    else
      warn "jq is required by devlair modules but no package manager found"
      meta "install jq manually before running 'devlair init'"
    fi
  fi
fi

rm -f "$TMP_CHECKSUMS"

printf "\n%s✓%s %sdevlair %s installed%s\n" "$C_GREEN" "$C_RESET" "$C_BOLD" "$LATEST" "$C_RESET"
printf "  %s%s%s\n\n" "$C_COMMENT" "${INSTALL_DIR}/${BIN}" "$C_RESET"

printf "%sNext step:%s\n" "$C_BOLD" "$C_RESET"
if [[ "$OS_SUFFIX" == "darwin" ]]; then
  printf "  %sdevlair init%s\n\n" "$C_PURPLE" "$C_RESET"
else
  printf "  %sdevlair init%s  %s(will prompt for sudo if needed)%s\n\n" \
    "$C_PURPLE" "$C_RESET" "$C_COMMENT" "$C_RESET"
fi
