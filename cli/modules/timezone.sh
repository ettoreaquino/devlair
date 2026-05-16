#!/usr/bin/env bash
# modules/timezone.sh — Timezone
# devlair module: timezone
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

MODE=${1:-run}

do_run() {
  local tz
  tz=$(ctx_get_config timezone)
  [[ -z "$tz" ]] && tz="UTC"

  timedatectl set-timezone "$tz" >&2
  json_result "ok" "$tz"
}

do_check() {
  local tz
  tz=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "unknown")
  json_check "timezone" "ok" "$tz"
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
