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

TELEGRAM_MARKETPLACE="anthropics/claude-plugins-official"
TELEGRAM_PLUGIN="telegram@claude-plugins-official"

_install_script() {
  local bin_dir=$1 name=$2 src=$3
  mkdir -p "$bin_dir"
  cp "$src" "$bin_dir/$name"
  chmod 755 "$bin_dir/$name"
  chown_user "$bin_dir/$name"
  chown_user "$bin_dir"
}

_ensure_telegram_plugin() {
  # Add marketplace if not present
  local marketplaces
  marketplaces=$(run_as "$USERNAME" claude plugin marketplace list --json 2>/dev/null || echo "[]")
  if ! echo "$marketplaces" | jq -e '.[] | select(.name=="claude-plugins-official")' >/dev/null 2>&1; then
    run_as "$USERNAME" claude plugin marketplace add "$TELEGRAM_MARKETPLACE" >&2 || true
  fi

  # Install plugin if not present
  local plugins
  plugins=$(run_as "$USERNAME" claude plugin list --json 2>/dev/null || echo "[]")
  if ! echo "$plugins" | jq -e '.[] | select(.name=="telegram" and .marketplace=="claude-plugins-official")' >/dev/null 2>&1; then
    run_as "$USERNAME" claude plugin install "$TELEGRAM_PLUGIN" >&2 || true
  fi
}

do_run() {
  local claude_dir="$USER_HOME/.claude"
  mkdir -p "$claude_dir"
  chown_user "$claude_dir"

  # Install Claude Code CLI if not present
  local install_detail=""
  if ! cmd_exists claude; then
    json_progress "installing claude code"
    local script
    script=$(download_script "https://claude.ai/install.sh")
    run_shell_as "$USERNAME" "bash \"$script\"" >&2
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
  chown_user "$settings_path"

  # Install helper scripts
  local bin_dir="$USER_HOME/.devlair/bin"
  _install_script "$bin_dir" "claude-status.sh" "$SCRIPT_DIR/configs/claude-status.sh"
  _install_script "$bin_dir" "claude-telegram" "$SCRIPT_DIR/configs/claude-telegram.sh"
  _install_script "$bin_dir" "tmx-new" "$SCRIPT_DIR/configs/tmx-new.sh"

  # Install Telegram channel plugin (requires claude CLI)
  local plugin_detail=""
  if cmd_exists claude; then
    json_progress "configuring telegram plugin"
    _ensure_telegram_plugin 2>/dev/null || plugin_detail="telegram plugin failed"
  fi

  local parts=()
  [[ -n "$install_detail" ]] && parts+=("$install_detail")
  parts+=("settings merged, scripts deployed")
  [[ -n "$plugin_detail" ]] && parts+=("$plugin_detail")
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

    # hooks
    local has_stop has_start
    has_stop=$(jq -e '.hooks.Stop' "$settings_path" 2>/dev/null && echo "yes" || echo "no")
    has_start=$(jq -e '.hooks.SessionStart' "$settings_path" 2>/dev/null && echo "yes" || echo "no")
    if [[ "$has_stop" == "yes" && "$has_start" == "yes" ]]; then
      json_check "Stop hook configured" "ok"
    else
      json_check "Stop hook configured" "warn"
    fi

    # channels
    local channels_enabled
    channels_enabled=$(jq -r '.channelsEnabled // false' "$settings_path" 2>/dev/null)
    if [[ "$channels_enabled" == "true" ]]; then
      json_check "channels enabled" "ok"
    else
      json_check "channels enabled" "warn"
    fi

    # telegram allowed
    if jq -e '.allowedChannelPlugins[] | select(.plugin=="telegram")' "$settings_path" >/dev/null 2>&1; then
      json_check "telegram plugin allowed" "ok"
    else
      json_check "telegram plugin allowed" "warn"
    fi
  else
    json_check "settings.json managed" "warn"
    json_check "Stop hook configured" "warn"
    json_check "channels enabled" "warn"
    json_check "telegram plugin allowed" "warn"
  fi

  # 1M context disabled
  if [[ -f "$USER_HOME/.zshrc" ]] && grep -q "CLAUDE_CODE_DISABLE_1M_CONTEXT" "$USER_HOME/.zshrc"; then
    json_check "1M context disabled" "ok"
  else
    json_check "1M context disabled" "warn"
  fi

  # telegram plugin installed
  if cmd_exists claude; then
    local plugins
    plugins=$(run_as "$USERNAME" claude plugin list --json 2>/dev/null || echo "[]")
    if echo "$plugins" | jq -e '.[] | select(.name=="telegram" and .marketplace=="claude-plugins-official")' >/dev/null 2>&1; then
      json_check "telegram plugin installed" "ok"
    else
      json_check "telegram plugin installed" "warn"
    fi
  else
    json_check "telegram plugin installed" "warn"
  fi

  # wrapper scripts
  if [[ -x "$USER_HOME/.devlair/bin/claude-telegram" ]]; then
    json_check "claude-telegram" "ok"
  else
    json_check "claude-telegram" "warn"
  fi

  if [[ -x "$USER_HOME/.devlair/bin/tmx-new" ]]; then
    json_check "tmx-new script" "ok"
  else
    json_check "tmx-new script" "warn"
  fi

  # bun installed
  if cmd_exists bun || [[ -x "$USER_HOME/.bun/bin/bun" ]]; then
    json_check "bun installed" "ok"
  else
    json_check "bun installed" "warn"
  fi

  # telegram token configured
  if [[ -f "$USER_HOME/.claude/channels/telegram/.env" ]]; then
    json_check "telegram token configured" "ok"
  else
    json_check "telegram token configured" "warn"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
