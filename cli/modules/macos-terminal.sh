#!/usr/bin/env bash
# modules/macos-terminal.sh — Terminal.app Dracula theme
# devlair module: macos_terminal
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
MODE=${1:-run}

# Pinned to commit 9ca4acf (dracula/terminal-app, 2018-10-05).
# To update: fetch new commit SHA, download, recompute SHA-256, update both constants.
_DRACULA_COMMIT="9ca4acf67fa43c51b21248a243407fd1549f4268"
_DRACULA_URL="https://raw.githubusercontent.com/dracula/terminal-app/${_DRACULA_COMMIT}/Dracula.terminal"
_DRACULA_SHA256="2d29ed73a31c343098cb405f12fdb48462382b37eb793300c2109e4a281b794d"

_defaults_read_profile() {
  if _is_root; then
    sudo -u "$USERNAME" defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true
  else
    defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true
  fi
}

_open_terminal_file() {
  local path=$1
  if _is_root; then
    local uid
    uid=$(id -u "$USERNAME")
    # launchctl asuser bridges to the user's Aqua/GUI session so Terminal.app
    # registers the imported theme (plain sudo -u cannot reach the GUI session).
    launchctl asuser "$uid" /usr/bin/open "$path" >&2
  else
    /usr/bin/open "$path" >&2
  fi
}

do_run() {
  local current
  current=$(_defaults_read_profile | tr -d '[:space:]')
  if [[ "$current" == "Dracula" ]]; then
    json_result "ok" "Dracula already default"
    return
  fi

  json_progress "downloading Dracula.terminal"
  local tmp
  tmp=$(mktemp /tmp/devlair.XXXXXX.terminal 2>/dev/null || mktemp)

  curl -fsSL "$_DRACULA_URL" -o "$tmp" >&2

  # Verify SHA-256 before handing to Terminal.app — .terminal plists support
  # CommandString which Terminal.app executes as a shell on every new window.
  local actual
  actual=$(shasum -a 256 "$tmp" | awk '{print $1}')
  if [[ "$actual" != "$_DRACULA_SHA256" ]]; then
    rm -f "$tmp"
    json_result "fail" "Dracula.terminal checksum mismatch (got $actual)"
    exit 1
  fi

  json_progress "importing Dracula theme"
  _open_terminal_file "$tmp"
  sleep 1

  run_shell_as "$USERNAME" "
    defaults write com.apple.Terminal 'Default Window Settings' 'Dracula'
    defaults write com.apple.Terminal 'Startup Window Settings' 'Dracula'
  " >&2

  rm -f "$tmp"
  json_result "ok" "Dracula theme imported and set as default"
}

do_check() {
  local current
  current=$(_defaults_read_profile | tr -d '[:space:]')
  if [[ "$current" == "Dracula" ]]; then
    json_check "Terminal.app Dracula" "ok" "Dracula is default"
  else
    json_check "Terminal.app Dracula" "warn" "current: ${current:-none}"
  fi
}

do_uninstall() {
  run_shell_as "$USERNAME" "
    defaults delete com.apple.Terminal 'Default Window Settings' 2>/dev/null || true
    defaults delete com.apple.Terminal 'Startup Window Settings' 2>/dev/null || true
  " >&2
  json_result "ok" "Terminal.app default profile reset"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
