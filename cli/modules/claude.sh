#!/usr/bin/env bash
# modules/claude.sh — Claude Code
# devlair module: claude
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

_install_script() {
  local bin_dir=$1 name=$2 src=$3
  mkdir -p "$bin_dir"
  cp "$src" "$bin_dir/$name"
  chmod 755 "$bin_dir/$name"
  chown_user "$bin_dir/$name"
  chown_user "$bin_dir"
}

do_run() {
  [[ "$USERNAME" =~ ^[A-Za-z0-9._-]+$ ]] || { json_result "fail" "invalid username: $USERNAME"; exit 1; }
  local claude_dir="$USER_HOME/.claude"
  # Recover ownership if a previous sudo run left the directory root-owned.
  [[ -d "$claude_dir" && ! -w "$claude_dir" ]] && sudo -n chown "$USERNAME" "$claude_dir" 2>/dev/null || true
  mkdir -p "$claude_dir"
  chown_user "$claude_dir"

  # Install Claude Code CLI if not present
  local install_detail=""
  if ! cmd_exists claude; then
    json_progress "installing claude code"
    local script
    script=$(download_script "https://claude.ai/install.sh")
    _run_as_user "bash \"$script\"" >&2
    rm -f "$script"
    json_install "claude" "claude.ai" false
    install_detail="claude code installed"
  fi

  # Merge settings
  json_progress "merging settings"
  local settings_path="$claude_dir/settings.json"
  local patch
  patch=$(cat "$SCRIPT_DIR/configs/claude-settings.json")
  update_json "$settings_path" "$patch"
  # Strip legacy channel/hook keys left by the retired Telegram feature so that
  # re-running init migrates existing users off the dead session hooks.
  local stripped
  stripped=$(jq 'del(.channelsEnabled, .allowedChannelPlugins, .hooks)' "$settings_path")
  printf '%s\n' "$stripped" > "$settings_path"
  chown_user "$settings_path"

  # Install helper scripts
  local bin_dir="$USER_HOME/.devlair/bin"
  _install_script "$bin_dir" "tmx-new" "$SCRIPT_DIR/configs/tmx-new.sh"

  local parts=()
  [[ -n "$install_detail" ]] && parts+=("$install_detail")
  parts+=("settings merged, scripts deployed")
  json_result "ok" "$(IFS=', '; echo "${parts[*]}")"
}

do_check() {
  local settings_path="$USER_HOME/.claude/settings.json"

  # claude installed
  if cmd_exists claude; then
    json_check "claude installed" "ok"
  else
    json_check "claude installed" "warn"
  fi

  # settings.json managed
  if [[ -f "$settings_path" ]]; then
    json_check "settings.json managed" "ok"
  else
    json_check "settings.json managed" "warn"
  fi

  # 1M context disabled
  if [[ -f "$USER_HOME/.zshrc" ]] && grep -q "CLAUDE_CODE_DISABLE_1M_CONTEXT" "$USER_HOME/.zshrc"; then
    json_check "1M context disabled" "ok"
  else
    json_check "1M context disabled" "warn"
  fi

  # tmx-new helper
  if [[ -x "$USER_HOME/.devlair/bin/tmx-new" ]]; then
    json_check "tmx-new script" "ok"
  else
    json_check "tmx-new script" "warn"
  fi
}

do_uninstall() {
  local removed=()
  local claude_dir="$USER_HOME/.claude"
  local settings_path="$claude_dir/settings.json"
  local bin_dir="$USER_HOME/.devlair/bin"

  # Strip devlair-managed keys from settings.json (current + legacy channel keys).
  if [[ -f "$settings_path" ]]; then
    json_progress "cleaning settings.json"
    local cleaned
    cleaned=$(jq 'del(.model, .effortLevel, .channelsEnabled, .allowedChannelPlugins, .hooks)' \
      "$settings_path" 2>/dev/null || echo "")
    if [[ -z "$cleaned" || "$cleaned" == "{}" ]]; then
      rm -f "$settings_path"
      removed+=("settings.json")
    else
      printf '%s\n' "$cleaned" > "$settings_path"
      chown_user "$settings_path"
      removed+=("settings.json keys")
    fi
  fi

  # Remove devlair helper scripts and legacy channel/session-tracking artifacts.
  rm_user_path "$bin_dir/tmx-new"
  rm_user_path "$bin_dir/claude-status.sh"
  rm_user_path "$bin_dir/claude-telegram"
  rm_user_path "$claude_dir/channels"
  rm_user_path "$claude_dir/devlair-active"
  rm_user_path "$claude_dir/devlair-sessions.jsonl"

  # The Claude Code CLI itself is removed only when packages are being purged.
  if [[ "$(cfg_bool remove_packages false)" == "true" ]]; then
    rm_user_path "$USER_HOME/.local/bin/claude"
  fi

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
