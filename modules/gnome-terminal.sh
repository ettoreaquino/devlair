#!/usr/bin/env bash
# modules/gnome-terminal.sh — Gnome Terminal Dracula
# devlair module: gnome_terminal
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
MODE=${1:-run}

# Dracula palette (dconf format)
DRACULA_PALETTE="['#282a36', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']"

_default_profile_path() {
  local profile_id
  profile_id=$(gsettings get org.gnome.Terminal.ProfilesList default 2>/dev/null | tr -d "' ")
  [[ -z "$profile_id" ]] && return 1
  echo "/org/gnome/terminal/legacy/profiles:/:${profile_id}/"
}

_dbus_env() {
  local uid
  uid=$(id -u "$1")
  echo "export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${uid}/bus"
}

do_run() {
  if ! cmd_exists gsettings; then
    json_result "skip" "gsettings not available"
    exit 2
  fi

  local path
  path=$(_default_profile_path) || {
    json_result "skip" "no default terminal profile found"
    exit 2
  }

  json_progress "applying Dracula colors"
  local dbus_export
  dbus_export=$(_dbus_env "$USERNAME")

  run_shell_as "$USERNAME" "
    $dbus_export
    dconf write ${path}visible-name \"'Devlair Dracula'\"
    dconf write ${path}background-color \"'#282a36'\"
    dconf write ${path}foreground-color \"'#f8f8f2'\"
    dconf write ${path}bold-color \"'#6272a4'\"
    dconf write ${path}bold-color-same-as-fg \"false\"
    dconf write ${path}palette \"$DRACULA_PALETTE\"
    dconf write ${path}use-theme-colors \"false\"
    dconf write ${path}use-theme-transparency \"false\"
  " >&2

  json_result "ok" "Dracula colors applied to Gnome Terminal"
}

do_check() {
  if ! cmd_exists gsettings; then
    json_check "gnome-terminal" "warn" "gsettings missing"
    return
  fi

  local path
  path=$(_default_profile_path) || {
    json_check "gnome-terminal" "warn" "no profile"
    return
  }

  local bg
  bg=$(dconf read "${path}background-color" 2>/dev/null || true)
  if [[ "$bg" == *"#282a36"* ]]; then
    json_check "gnome-terminal Dracula" "ok"
  else
    json_check "gnome-terminal Dracula" "warn"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
