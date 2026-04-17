#!/usr/bin/env bash
# modules/shell.sh — Shell aliases
# devlair module: shell
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

MARKER="# ── devlair aliases ─"
ALIASES_FILE="$SCRIPT_DIR/configs/shell-aliases.zsh"

# _clean_zshrc -- remove lines injected by third-party installers outside the devlair block.
_clean_zshrc() {
  local text=$1
  awk -v marker="$MARKER" '
    BEGIN { in_block = 0 }
    index($0, marker) { in_block = 1 }
    in_block { print; next }
    /\. "\$HOME\/\.local\/bin\/env"/ { next }
    /^export NVM_DIR=/ { next }
    /\\\. "\$NVM_DIR\/nvm\.sh"/ { next }
    /# This loads nvm/ { next }
    /^export BUN_INSTALL=/ { next }
    /\[ -s "\$BUN_INSTALL\/bin\/bun" \]/ { next }
    /# bun/ { next }
    { print }
  ' <<< "$text"
}

do_run() {
  local zshrc="$USER_HOME/.zshrc"
  local existing=""
  local aliases
  aliases=$(cat "$ALIASES_FILE")

  if [[ -f "$zshrc" ]]; then
    existing=$(cat "$zshrc")
  fi

  if [[ "$existing" == *"$MARKER"* ]]; then
    # Refresh: keep everything before the marker, clean it, then append aliases
    local header
    header="${existing%%${MARKER}*}"
    header=$(_clean_zshrc "$header")
    printf '%s%s\n' "$header" "$aliases" > "$zshrc"
    chown_user "$zshrc"
    json_result "ok" "aliases refreshed in .zshrc"
  else
    # First time: clean any junk, then append
    local cleaned
    cleaned=$(_clean_zshrc "$existing")
    printf '%s\n%s\n' "$cleaned" "$aliases" > "$zshrc"
    chown_user "$zshrc"
    json_result "ok" "aliases added to .zshrc"
  fi
}

do_check() {
  local zshrc="$USER_HOME/.zshrc"
  if [[ -f "$zshrc" ]] && grep -qF "$MARKER" "$zshrc"; then
    json_check "shell aliases" "ok"
  else
    json_check "shell aliases" "warn"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
