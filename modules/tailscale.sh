#!/usr/bin/env bash
# modules/tailscale.sh — Tailscale
# devlair module: tailscale
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

MODE=${1:-run}

do_run() {
  if ! cmd_exists tailscale; then
    json_progress "installing tailscale"
    local script
    script=$(download_script "https://tailscale.com/install.sh")
    bash "$script" >&2
    rm -f "$script"
    json_install "tailscale" "tailscale.com" false
  fi

  if ! tailscale status >/dev/null 2>&1; then
    json_progress "connecting to tailscale"
    tailscale up >&2 || true
  fi

  local ip
  ip=$(tailscale ip -4 2>/dev/null || true)
  if [[ -n "$ip" ]]; then
    json_result "ok" "$ip"
  else
    json_result "warn" "connected but no IP yet — run 'tailscale status'"
  fi
}

do_check() {
  if cmd_exists tailscale; then
    json_check "tailscale installed" "ok"
  else
    json_check "tailscale installed" "fail"
    return
  fi

  local ip
  ip=$(tailscale ip -4 2>/dev/null || true)
  if [[ -n "$ip" ]]; then
    json_check "tailscale connected" "ok" "$ip"
  else
    json_check "tailscale connected" "warn" "not connected"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
