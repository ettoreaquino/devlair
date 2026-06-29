#!/usr/bin/env bash
# modules/shell.sh — Shell aliases
# devlair module: shell
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
BRAND=$(ctx_get_config brand)
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
  [[ "$USERNAME" =~ ^[A-Za-z0-9._-]+$ ]] || { json_result "fail" "invalid username: $USERNAME"; exit 1; }

  # Persist the brand (from `init --brand NAME`) so the login banner renders it
  # and future runs / doctor / upgrade reuse it. Written in the module layer so
  # ownership stays correct under sudo, matching the chown_user pattern below.
  if [[ -n "$BRAND" ]]; then
    mkdir -p "$USER_HOME/.devlair"
    printf '%s\n' "$BRAND" > "$USER_HOME/.devlair/brand"
    chown_user "$USER_HOME/.devlair/brand"
    chown_user "$USER_HOME/.devlair"
  fi

  local zshrc="$USER_HOME/.zshrc"
  local existing=""
  local aliases
  aliases=$(cat "$ALIASES_FILE")

  if [[ -f "$zshrc" ]]; then
    existing=$(cat "$zshrc")
    # Recover ownership if a previous sudo run left the file root-owned.
    [[ -w "$zshrc" ]] || sudo -n chown "$USERNAME" "$zshrc" 2>/dev/null || true
  fi

  if [[ "$existing" == *"$MARKER"* ]]; then
    # Refresh: keep everything before the marker, clean it, then append aliases.
    # The $(...) on $header strips its trailing newline, so the separator must
    # be restored explicitly — otherwise the aliases marker is glued onto the
    # last header line (e.g. `source ".../init.zsh"# ── devlair aliases ─`),
    # producing a path zsh cannot source.
    local header
    header="${existing%%${MARKER}*}"
    header=$(_clean_zshrc "$header")
    printf '%s\n%s\n' "$header" "$aliases" > "$zshrc"
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

do_uninstall() {
  local removed=()
  local zshrc="$USER_HOME/.zshrc"

  # Strip the devlair aliases block (from MARKER to EOF) from .zshrc.
  if [[ -f "$zshrc" ]] && grep -qF "$MARKER" "$zshrc"; then
    json_progress "removing aliases from .zshrc"
    local before
    before="$(awk -v marker="$MARKER" 'index($0, marker){exit} {print}' "$zshrc")"
    # Trim trailing blank lines, then write back (empty file if nothing remains).
    before="${before%$'\n'}"
    if [[ -n "${before//[$'\n\t ']/}" ]]; then
      printf '%s\n' "$before" > "$zshrc"
    else
      : > "$zshrc"
    fi
    chown_user "$zshrc"
    removed+=("aliases block")
  fi

  rm_user_path "$USER_HOME/.devlair/brand"

  if [[ ${#removed[@]} -eq 0 ]]; then
    json_result "skip" "nothing to remove"
    exit 2
  fi
  json_result "ok" "removed: $(IFS=', '; echo "${removed[*]}")"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
