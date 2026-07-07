#!/usr/bin/env bash
# modules/macos-terminal.sh — Terminal.app Dracula theme
# devlair module: macos_terminal
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
[[ "$USERNAME" =~ ^[A-Za-z0-9._-]+$ ]] || { json_result "fail" "invalid username: $USERNAME"; exit 1; }
MODE=${1:-run}

# Pinned to commit 9ca4acf (dracula/terminal-app, 2018-10-05).
# To update: fetch new commit SHA, download, recompute SHA-256, update both constants.
_DRACULA_COMMIT="9ca4acf67fa43c51b21248a243407fd1549f4268"
_DRACULA_URL="https://raw.githubusercontent.com/dracula/terminal-app/${_DRACULA_COMMIT}/Dracula.terminal"
_DRACULA_SHA256="2d29ed73a31c343098cb405f12fdb48462382b37eb793300c2109e4a281b794d"

# _user_defaults ARGS... -- run `defaults ARGS...` against the target user's GUI
# (Aqua) preferences session, where Terminal.app reads and writes its settings.
# As root we bridge into that session with `launchctl asuser` (a bare `sudo -u`
# lands in the wrong per-user context, so Terminal never sees the change); as the
# user we call defaults directly. Registering the theme through `defaults` —
# rather than `open`ing the .terminal file — is what avoids spawning a stray
# Terminal window during init.
_user_defaults() {
  if _is_root; then
    launchctl asuser "$(id -u "$USERNAME")" sudo -u "$USERNAME" defaults "$@"
  else
    defaults "$@"
  fi
}

_defaults_read_profile() {
  _user_defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true
}

_dracula_profile_registered() {
  _user_defaults read com.apple.Terminal "Window Settings" 2>/dev/null \
    | grep -qE '^[[:space:]]+Dracula = '
}

do_run() {
  local current
  current=$(_defaults_read_profile | tr -d '[:space:]')
  if [[ "$current" == "Dracula" ]] && _dracula_profile_registered; then
    json_result "ok" "Dracula already default"
    return
  fi

  json_progress "downloading Dracula.terminal"
  local tmpdir tmp
  tmpdir=$(mktemp -d)
  tmp="$tmpdir/Dracula.terminal"

  curl -fsSL "$_DRACULA_URL" -o "$tmp" >&2

  # Verify SHA-256 before importing — .terminal plists support CommandString,
  # which Terminal.app executes as a shell on every new window.
  local actual
  actual=$(shasum -a 256 "$tmp" | awk '{print $1}')
  if [[ "$actual" != "$_DRACULA_SHA256" ]]; then
    rm -rf "$tmpdir"
    json_result "fail" "Dracula.terminal checksum mismatch (got $actual)"
    exit 1
  fi

  json_progress "importing Dracula theme"
  # A .terminal file is a complete Window-Settings dict, so -dict-add stores it
  # verbatim under the "Dracula" profile name. Importing through `defaults` this
  # way (instead of `open`ing the file) registers the theme WITHOUT popping open
  # a new Terminal window, and needs no settle delay.
  _user_defaults write com.apple.Terminal "Window Settings" -dict-add "Dracula" "$(cat "$tmp")" >&2
  _user_defaults write com.apple.Terminal "Default Window Settings" "Dracula" >&2
  _user_defaults write com.apple.Terminal "Startup Window Settings" "Dracula" >&2

  rm -rf "$tmpdir"
  json_result "ok" "Dracula theme imported and set as default"
}

do_check() {
  local current
  current=$(_defaults_read_profile | tr -d '[:space:]')
  if [[ "$current" == "Dracula" ]] && _dracula_profile_registered; then
    json_check "Terminal.app Dracula" "ok" "Dracula is default"
  else
    json_check "Terminal.app Dracula" "warn" "current: ${current:-none}"
  fi
}

do_uninstall() {
  _user_defaults delete com.apple.Terminal "Default Window Settings" 2>/dev/null || true
  _user_defaults delete com.apple.Terminal "Startup Window Settings" 2>/dev/null || true
  json_result "ok" "Terminal.app default profile reset"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
