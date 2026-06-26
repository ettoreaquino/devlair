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

  if [[ ! "$tz" =~ ^[A-Za-z_][A-Za-z0-9_+/-]*$ ]]; then
    json_result "fail" "invalid timezone: $tz"
    exit 1
  fi

  if [[ "$PLATFORM" == "macos" ]]; then
    ln -sf "/usr/share/zoneinfo/$tz" /etc/localtime >&2
  else
    timedatectl set-timezone "$tz" >&2
  fi

  json_result "ok" "$tz"
}

do_check() {
  local tz
  if [[ "$PLATFORM" == "macos" ]]; then
    tz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||' || echo "unknown")
  else
    tz=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "unknown")
  fi
  local status="ok"
  [[ "$tz" == "unknown" ]] && status="fail"
  json_check "timezone" "$status" "$tz"
}

do_uninstall() {
  # Timezone is a benign system setting; reverting it (to what?) is riskier than
  # leaving it. No-op.
  json_result "skip" "timezone left unchanged"
  exit 2
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
