#!/usr/bin/env bash
# modules/tmux.sh — tmux
# devlair module: tmux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

do_run() {
  local conf="$USER_HOME/.tmux.conf"

  if [[ "$PLATFORM" == "macos" ]]; then
    cmd_exists tmux || brew_install tmux
    # pbcopy/pbpaste are built-in on macOS — no clipboard helper needed
  else
    cmd_exists tmux || apt_install tmux
    if ! cmd_exists wl-copy && ! cmd_exists xclip; then
      apt_install wl-clipboard
    fi
  fi

  json_progress "writing tmux config"
  cp "$SCRIPT_DIR/configs/tmux.conf" "$conf"
  chown_user "$conf"

  # TPM (tmux plugin manager)
  local plugins_dir="$USER_HOME/.tmux/plugins"
  mkdir -p "$plugins_dir"
  chown_user "$USER_HOME/.tmux"
  chown_user "$plugins_dir"

  local tpm_path="$plugins_dir/tpm"
  if [[ ! -d "$tpm_path" ]]; then
    json_progress "installing TPM"
    if _is_root; then
      run_as "$USERNAME" git clone https://github.com/tmux-plugins/tpm "$tpm_path" >&2
    else
      git clone https://github.com/tmux-plugins/tpm "$tpm_path" >&2
    fi
  fi

  # Install TPM plugins (resurrect, continuum) non-interactively
  local install_script="$tpm_path/bin/install_plugins"
  if [[ -x "$install_script" ]]; then
    json_progress "installing TPM plugins"
    if _is_root; then
      run_as "$USERNAME" "$install_script" >&2 || true
    else
      "$install_script" >&2 || true
    fi
  fi

  json_result "ok" "Dracula theme + TPM/resurrect/clipboard applied"
}

do_check() {
  if cmd_exists tmux; then
    json_check "tmux installed" "ok"
  else
    json_check "tmux installed" "fail"
  fi

  if [[ -f "$USER_HOME/.tmux.conf" ]]; then
    json_check ".tmux.conf" "ok"
  else
    json_check ".tmux.conf" "warn"
  fi

  local plugins_dir="$USER_HOME/.tmux/plugins"
  if [[ -d "$plugins_dir/tpm" ]]; then
    json_check "TPM installed" "ok"
  else
    json_check "TPM installed" "warn"
  fi

  if [[ -d "$plugins_dir/tmux-resurrect" ]] && [[ -d "$plugins_dir/tmux-continuum" ]]; then
    json_check "TPM plugins (resurrect + continuum)" "ok"
  else
    json_check "TPM plugins (resurrect + continuum)" "warn"
  fi

  if [[ "$PLATFORM" == "macos" ]]; then
    cmd_exists pbcopy \
      && json_check "Clipboard tool (pbcopy)" "ok" \
      || json_check "Clipboard tool (pbcopy)" "warn"
  elif cmd_exists wl-copy || cmd_exists xclip; then
    json_check "Clipboard tool (wl-copy / xclip)" "ok"
  else
    json_check "Clipboard tool (wl-copy / xclip)" "warn"
  fi
}

do_uninstall() {
  local removed=()
  rm_user_path "$USER_HOME/.tmux.conf"
  rm_user_path "$USER_HOME/.tmux/plugins"
  rm_user_path "$USER_HOME/.tmux"

  if [[ "$(cfg_bool remove_packages false)" == "true" ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_uninstall tmux
    else
      apt_purge tmux wl-clipboard
    fi
    removed+=("tmux package")
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
