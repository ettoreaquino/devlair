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

_defaults_read_profile() {
  if _is_root; then
    sudo -u "$USERNAME" defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true
  else
    defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true
  fi
}

# Returns 0 if the Dracula profile is actually registered in Terminal.app's Window Settings.
# Terminal.app names imported profiles after the filename stem, not the plist name key, so
# a temp-file import can register under the wrong name even when Default Window Settings = Dracula.
_dracula_profile_registered() {
  local prefs
  if _is_root; then
    prefs="/Users/$USERNAME/Library/Preferences/com.apple.Terminal.plist"
  else
    prefs="$HOME/Library/Preferences/com.apple.Terminal.plist"
  fi
  /usr/libexec/PlistBuddy -c "Print :'Window Settings':Dracula" "$prefs" > /dev/null 2>&1
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
  if [[ "$current" == "Dracula" ]] && _dracula_profile_registered; then
    json_result "ok" "Dracula already default"
    return
  fi

  json_progress "downloading Dracula.terminal"
  # The file must be named Dracula.terminal — Terminal.app uses the filename stem
  # as the registered profile name, ignoring the name key inside the plist.
  local tmpdir tmp
  tmpdir=$(mktemp -d)
  tmp="$tmpdir/Dracula.terminal"

  curl -fsSL "$_DRACULA_URL" -o "$tmp" >&2

  # Verify SHA-256 before handing to Terminal.app — .terminal plists support
  # CommandString which Terminal.app executes as a shell on every new window.
  local actual
  actual=$(shasum -a 256 "$tmp" | awk '{print $1}')
  if [[ "$actual" != "$_DRACULA_SHA256" ]]; then
    rm -rf "$tmpdir"
    json_result "fail" "Dracula.terminal checksum mismatch (got $actual)"
    exit 1
  fi

  json_progress "importing Dracula theme"
  _open_terminal_file "$tmp"
  # Terminal.app needs a moment to register the imported profile before defaults write can reference it by name
  sleep 1

  run_shell_as "$USERNAME" "
    defaults write com.apple.Terminal 'Default Window Settings' 'Dracula'
    defaults write com.apple.Terminal 'Startup Window Settings' 'Dracula'
  " >&2

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
