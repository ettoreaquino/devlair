#!/usr/bin/env bash
# cli/modules/tailscale.sh — Tailscale
# devlair module: tailscale
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

MODE=${1:-run}

# `tailscale up` without an auth key blocks until the user completes browser
# auth. We background it, scrape the URL it prints, surface the URL through
# the protocol, and poll `tailscale status` until the node connects.
#
# The backgrounded `tailscale up` keeps running for the duration of the poll;
# once the user authenticates in their browser it completes on its own. If the
# poll deadline expires first, we kill it.
ts_connect() {
  local url_wait_secs=10
  local poll_timeout_secs
  if [[ "${TS_AUTH_POLL_TIMEOUT_SECS:-}" =~ ^[0-9]+$ ]]; then
    poll_timeout_secs=$TS_AUTH_POLL_TIMEOUT_SECS
  else
    poll_timeout_secs=300
  fi
  local poll_interval_secs=2

  local authkey="${TS_AUTHKEY:-}"
  if [[ -z "$authkey" ]]; then
    authkey=$(ctx_get_config tailscale_authkey)
  fi

  if [[ -n "$authkey" ]]; then
    json_progress "connecting with authkey"
    TS_AUTHKEY="$authkey" tailscale up --reset >&2 || true
    return
  fi

  json_progress "starting tailscale"
  # Initialise pid/log before the trap is armed so a signal that arrives
  # between `trap` and `pid=$!` does not hit `set -u` "unbound variable".
  local pid=""
  local log=""
  log=$(mktemp)
  # shellcheck disable=SC2064
  trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; rm -f "$log"' EXIT INT TERM
  tailscale up >"$log" 2>&1 &
  pid=$!

  local url=""
  local waited=0
  while (( waited < url_wait_secs )); do
    sleep 1
    # Avoid `((waited++))` — its post-increment returns 0 on the first
    # iteration, which under `set -e` would abort the script and fire the
    # EXIT trap after the local `pid` has gone out of scope, triggering a
    # "pid: unbound variable" under `set -u`.
    waited=$((waited + 1))
    url=$(grep -oE 'https://login\.tailscale\.com/[A-Za-z0-9_/.-]+' "$log" | head -1 || true)
    [[ -n "$url" ]] && break
  done

  if [[ -z "$url" ]]; then
    trap - EXIT INT TERM
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -f "$log"
    return
  fi

  json_auth_url "$url" "Open this URL in your browser to authenticate Tailscale"

  # Poll until the node connects. tailscaled writes its `Running` state into
  # `tailscale status` as soon as auth completes, even before this orphan
  # `tailscale up` returns.
  local elapsed=0
  local timed_out=false
  while (( elapsed < poll_timeout_secs )); do
    if tailscale status >/dev/null 2>&1; then
      break
    fi
    sleep "$poll_interval_secs"
    elapsed=$((elapsed + poll_interval_secs))
  done
  (( elapsed >= poll_timeout_secs )) && timed_out=true

  # trap handles kill + wait + rm -f on EXIT; explicit cleanup here so the
  # trap becomes a no-op for the normal path.
  trap - EXIT INT TERM
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f "$log"

  TS_AUTH_URL="$url"
  TS_AUTH_TIMED_OUT="$timed_out"
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
  TS_AUTH_TIMED_OUT=""
  if ! tailscale status >/dev/null 2>&1; then
    ts_connect
  fi

  local ip
  ip=$(tailscale ip -4 2>/dev/null || true)
  local poll_mins=$(( ${TS_AUTH_POLL_TIMEOUT_SECS:-300} / 60 ))
  if [[ -n "$ip" ]]; then
    json_result "ok" "$ip"
  elif [[ "$TS_AUTH_TIMED_OUT" == "true" ]]; then
    json_result "fail" "auth not completed within ${poll_mins} minutes — open $TS_AUTH_URL or run 'sudo tailscale up'"
  elif [[ -n "$TS_AUTH_URL" ]]; then
    json_result "fail" "tailscale did not connect — open $TS_AUTH_URL or run 'sudo tailscale up'"
  else
    json_result "fail" "could not obtain tailscale auth URL — run 'sudo tailscale up' manually"
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
