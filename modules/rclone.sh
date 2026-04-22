#!/usr/bin/env bash
# modules/rclone.sh — rclone sync
# devlair module: rclone
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

do_run() {
  if cmd_exists rclone; then
    json_result "skip" "already installed"
    exit 2
  fi

  json_progress "installing rclone"
  local script
  script=$(download_script "https://rclone.org/install.sh")
  bash "$script" >&2
  rm -f "$script"
  json_install "rclone" "rclone.org" false
  json_result "ok" "installed — run 'devlair sync --add' to configure"
}

do_check() {
  if cmd_exists rclone; then
    json_check "rclone" "ok" "installed"
  else
    json_check "rclone" "fail" "missing"
    return
  fi

  # Check for systemd user timers
  local svc_dir="$USER_HOME/.config/systemd/user"
  local -a timers=()
  if [[ -d "$svc_dir" ]]; then
    for f in "$svc_dir"/rclone-*.service; do
      [[ -f "$f" ]] && timers+=("$f")
    done
  fi

  if [[ ${#timers[@]} -eq 0 ]]; then
    json_check "rclone sync" "warn" "no syncs configured"
    return
  fi

  for timer_svc in "${timers[@]}"; do
    local remote_name
    remote_name=$(basename "$timer_svc" .service)
    remote_name="${remote_name#rclone-}"
    local timer_name
    timer_name=$(basename "$timer_svc" .service).timer
    local active
    active=$(run_as "$USERNAME" systemctl --user is-active "$timer_name" 2>/dev/null || echo "inactive")
    if [[ "$active" == "active" ]]; then
      json_check "rclone-$remote_name" "ok" "timer active"
    else
      json_check "rclone-$remote_name" "warn" "timer $active"
    fi
  done
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
