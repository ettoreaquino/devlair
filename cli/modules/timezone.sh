#!/usr/bin/env bash
# cli/modules/timezone.sh — Timezone
# devlair module: timezone
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

PLATFORM=$(ctx_get platform)
MODE=${1:-run}

do_run() {
  local tz
  tz=$(ctx_get_config timezone)
  [[ -z "$tz" ]] && tz="UTC"

  if [[ "$PLATFORM" == "macos" ]]; then
    systemsetup -settimezone "$tz" >&2
  else
    timedatectl set-timezone "$tz" >&2
  fi

  json_result "ok" "$tz"
}

do_check() {
  local tz
  if [[ "$PLATFORM" == "macos" ]]; then
    tz=$(systemsetup -gettimezone 2>/dev/null | sed 's/Time Zone: //' || echo "unknown")
  else
    tz=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "unknown")
  fi
  json_check "timezone" "ok" "$tz"
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
