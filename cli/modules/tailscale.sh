#!/usr/bin/env bash
# cli/modules/tailscale.sh — Tailscale
# devlair module: tailscale
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

MODE=${1:-run}

# tailscale up blocks on browser auth and cannot be driven interactively from
# the wizard; this function surfaces the URL without blocking.
ts_connect() {
  local url_wait_secs=10
  local authkey="${TS_AUTHKEY:-}"
  if [[ -z "$authkey" ]]; then
    authkey=$(ctx_get_config tailscale_authkey)
  fi

  if [[ -n "$authkey" ]]; then
    json_progress "connecting with authkey"
    TS_AUTHKEY="$authkey" tailscale up --reset >&2 || true
    return
  fi

  json_progress "starting tailscale (non-interactive)"
  local log
  log=$(mktemp)
  # --timeout=0s makes `tailscale up` print the auth URL and return without
  # waiting for the user to open it on tailscaled versions that support it;
  # on older versions we fall back to a background process + sleep + kill.
  tailscale up --timeout=0s >"$log" 2>&1 || true
  local url
  url=$(grep -oE 'https://login\.tailscale\.com/[A-Za-z0-9_/.-]+' "$log" | head -1 || true)
  rm -f "$log"

  if [[ -z "$url" ]]; then
    # --timeout=0s unsupported — run the blocking form in background and
    # scrape the URL it prints, then stop the orphan.
    log=$(mktemp)
    tailscale up >"$log" 2>&1 &
    local pid=$!
    local waited=0
    while (( waited < url_wait_secs )); do
      sleep 1
      ((waited++))
      url=$(grep -oE 'https://login\.tailscale\.com/[A-Za-z0-9_/.-]+' "$log" | head -1 || true)
      [[ -n "$url" ]] && break
    done
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -f "$log"
  fi

  if [[ -n "$url" ]]; then
    TS_AUTH_URL="$url"
  fi
}

do_run() {
  if ! cmd_exists tailscale; then
    json_progress "installing tailscale"
    local script
    script=$(download_script "https://tailscale.com/install.sh")
    bash "$script" >&2
    rm -f "$script"
    json_install "tailscale" "tailscale.com" false
  fi

  TS_AUTH_URL=""
  if ! tailscale status >/dev/null 2>&1; then
    ts_connect
  fi

  local ip
  ip=$(tailscale ip -4 2>/dev/null || true)
  if [[ -n "$ip" ]]; then
    json_result "ok" "$ip"
  elif [[ -n "$TS_AUTH_URL" ]]; then
    json_result "warn" "needs auth — open $TS_AUTH_URL or run 'sudo tailscale up'"
  else
    json_result "warn" "not connected — run 'sudo tailscale up' to authenticate"
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
