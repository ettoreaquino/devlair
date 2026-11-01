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

# install_plugin DIR NAME -- unpack the pinned tmux-plugins/NAME tarball into
# DIR/NAME as the user. Leaves an existing install alone.
install_plugin() {
  local dest="$1/$2" name=$2 tarball untar run=(bash -c)
  [[ -d "$dest" ]] && return 0
  tarball=$(download_pinned "$name") || {
    json_result "fail" "$name failed verification"
    exit 1
  }
  printf -v untar 'mkdir -p %q && tar -xzf %q --strip-components=1 -C %q' "$dest" "$tarball" "$dest"
  _is_root && run=(run_shell_as "$USERNAME")
  if ! "${run[@]}" "$untar" >&2; then
    rm -rf "$dest" "$tarball"
    json_result "fail" "$name failed to unpack"
    exit 1
  fi
  rm -f "$tarball"
  json_install "$name" "$(pin_get "$name" url)" true
}

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

  # TPM (tmux plugin manager) and the plugins tmux.conf lists. Each comes from
  # a pinned, checksum-verified tarball instead of a git clone, so TPM never
  # has to fetch anything itself.
  local plugins_dir="$USER_HOME/.tmux/plugins"
  mkdir -p "$plugins_dir"
  chown_user "$USER_HOME/.tmux"
  chown_user "$plugins_dir"

  json_progress "installing TPM plugins"
  local plugin
  for plugin in tpm tmux-resurrect tmux-continuum; do
    install_plugin "$plugins_dir" "$plugin"
  done

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
  json_result "ok" "removed: $(join_by ', ' "${removed[@]}")"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
