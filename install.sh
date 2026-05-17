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

# ── Dracula-styled output ─────────────────────────────────────────────────────
# Match cli/src/lib/theme.ts (and devlair/console.py). Auto-disable on non-TTY
# or when NO_COLOR is set so piped/CI output stays clean.
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
      err "Unknown option: $arg"
      err "Run with --help for usage."
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
    err "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

printf "\n%s%s devlair installer%s  %s· channel: %s · arch: %s%s\n\n" \
  "$C_BOLD" "$C_PINK" "$C_RESET" "$C_COMMENT" "$CHANNEL" "$ARCH_SUFFIX" "$C_RESET"

# ── Channel configuration ─────────────────────────────────────────────────────
section "Resolving release"
if [[ "$CHANNEL" == "pre" ]]; then
  ASSET_PREFIX="devlair-cli"
  # GitHub's /releases/latest endpoint excludes prereleases, so list and filter.
  LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=30" \
    | grep -o '"tag_name": *"devlair-cli-v[^"]*"' \
    | head -1 \
    | sed -E 's/.*"(devlair-cli-v[^"]*)"/\1/')
else
  ASSET_PREFIX="devlair"
  LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -o '"tag_name": *"[^"]*"' | head -1 \
    | grep -o '"v[^"]*"' | tr -d '"')
fi

if [[ -z "${LATEST:-}" ]]; then
  err "Could not determine latest version. Check your internet connection."
  exit 1
fi

ASSET="${ASSET_PREFIX}-linux-${ARCH_SUFFIX}"
ok "release ${LATEST}"
meta "asset: ${ASSET}"

# ── Download binary + checksums ───────────────────────────────────────────────
section "Downloading binary"
BASE_URL="https://github.com/${REPO}/releases/download/${LATEST}"
TMP=$(mktemp)
TMP_CHECKSUMS=$(mktemp)
curl -fsSL "${BASE_URL}/${ASSET}" -o "$TMP"
curl -fsSL "${BASE_URL}/checksums.txt" -o "$TMP_CHECKSUMS"
ok "downloaded ${ASSET}"

# ── Verify SHA-256 checksum ──────────────────────────────────────────────────
EXPECTED=$(grep " ${ASSET}\$" "$TMP_CHECKSUMS" | awk '{print $1}')
ACTUAL=$(sha256sum "$TMP" | awk '{print $1}')

if [[ -z "$EXPECTED" ]]; then
  warn "no checksum found for ${ASSET} — skipping verification"
elif [[ "$ACTUAL" != "$EXPECTED" ]]; then
  err "checksum mismatch!"
  meta "expected: ${EXPECTED}"
  meta "got:      ${ACTUAL}"
  rm -f "$TMP"
  exit 1
else
  ok "SHA-256 verified"
fi

chmod 755 "$TMP"

# ── Install (sudo if needed) ──────────────────────────────────────────────────
section "Installing binary"
if [[ -w "$INSTALL_DIR" ]]; then
  mv "$TMP" "${INSTALL_DIR}/${BIN}"
else
  sudo mv "$TMP" "${INSTALL_DIR}/${BIN}"
fi
chmod 755 "${INSTALL_DIR}/${BIN}" 2>/dev/null || sudo chmod 755 "${INSTALL_DIR}/${BIN}"
ok "${INSTALL_DIR}/${BIN}"

# ── Pre-release: fetch modules tarball ────────────────────────────────────────
# v2 shell modules live outside the compiled binary and ship as a separate
# tarball. v1 (stable) is self-contained and does not need this step.
if [[ "$CHANNEL" == "pre" ]]; then
  section "Fetching v2 modules"
  TMP_MODULES=$(mktemp)
  curl -fsSL "${BASE_URL}/modules.tar.gz" -o "$TMP_MODULES"

  EXPECTED_MODULES=$(grep " modules.tar.gz\$" "$TMP_CHECKSUMS" | awk '{print $1}')
  ACTUAL_MODULES=$(sha256sum "$TMP_MODULES" | awk '{print $1}')

  # Modules ship a fresh tree on every release — a missing checksum entry
  # means CI is misconfigured, not a soft warning. Hard-fail rather than
  # extract an unverified archive and execute its scripts as root.
  if [[ -z "$EXPECTED_MODULES" ]]; then
    err "no checksum entry for modules.tar.gz in checksums.txt — aborting"
    rm -f "$TMP_MODULES"
    exit 1
  elif [[ "$ACTUAL_MODULES" != "$EXPECTED_MODULES" ]]; then
    err "checksum mismatch for modules.tar.gz!"
    meta "expected: ${EXPECTED_MODULES}"
    meta "got:      ${ACTUAL_MODULES}"
    rm -f "$TMP_MODULES"
    exit 1
  else
    ok "SHA-256 verified"
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
  ok "modules installed to ${SHARE_DIR}/modules"

  # ── Pre-release: WSL-specific dpkg state cleanup ──────────────────────────
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

  # ── Pre-release: bootstrap runtime deps ────────────────────────────────────
  # modules/_lib.sh hard-requires jq for context parsing; on a fresh Ubuntu
  # the binary installs cleanly but every `devlair init` step exits 1 before
  # emitting any output. Install jq up-front so the first wizard run works.
  if ! command -v jq >/dev/null 2>&1; then
    section "Bootstrapping runtime deps"
    if command -v apt-get >/dev/null 2>&1; then
      $MAYBE_SUDO apt-get update -qq >/dev/null
      $MAYBE_SUDO apt-get install -y -qq jq >/dev/null
      ok "jq installed"
    else
      warn "jq is required by devlair modules but apt-get is not available"
      meta "install jq manually before running 'devlair init'"
    fi
  fi
fi

rm -f "$TMP_CHECKSUMS"

printf "\n%s✓%s %sdevlair %s installed%s\n" "$C_GREEN" "$C_RESET" "$C_BOLD" "$LATEST" "$C_RESET"
printf "  %s%s%s\n\n" "$C_COMMENT" "${INSTALL_DIR}/${BIN}" "$C_RESET"

# ── Channel-specific post-install notice ──────────────────────────────────────
if [[ "$CHANNEL" == "pre" ]]; then
  printf "%s!%s %sv2 alpha%s — the following v1 commands have been REMOVED:\n\n" \
    "$C_ORANGE" "$C_RESET" "$C_BOLD" "$C_RESET"
  printf "  %sdevlair sync%s         pin to v1 or run 'rclone bisync' directly\n" "$C_PINK" "$C_RESET"
  printf "  %sdevlair filesystem%s   not ported\n" "$C_PINK" "$C_RESET"
  printf "  %sdevlair claw%s         not ported\n\n" "$C_PINK" "$C_RESET"
  printf "  %sReport issues: https://github.com/ettoreaquino/devlair/issues%s\n\n" "$C_COMMENT" "$C_RESET"
fi

printf "%sNext step:%s\n" "$C_BOLD" "$C_RESET"
printf "  %sdevlair init%s\n\n" "$C_PURPLE" "$C_RESET"
