#!/usr/bin/env bash
# cli/modules/tailscale.sh — Tailscale
# devlair module: tailscale
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

# `tailscale up` without an auth key blocks until the user completes browser
# auth. We background it, scrape the URL it prints, surface the URL through
# the protocol, and poll `tailscale status` until the node connects.
#
# The backgrounded `tailscale up` keeps running for the duration of the poll;
# once the user authenticates in their browser it completes on its own. The
# wizard cancels the whole tree via SIGTERM (AbortController) if the user
# bails — there is no internal timeout.
ts_connect() {
  local url_wait_secs=10
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
    # $((waited + 1)) avoids set -e abort on the first iteration where ((waited++)) would return 0
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

  # Poll forever until the node connects. tailscaled writes `Running` into
  # `tailscale status` as soon as auth completes, even before the orphan
  # `tailscale up` returns. The user is sitting at the wizard; if they need
  # extra time we let them have it. Ctrl-C in the wizard sends SIGTERM down
  # the process group and the EXIT trap below cleans up.
  while ! tailscale status >/dev/null 2>&1; do
    sleep "$poll_interval_secs"
  done

  # trap handles kill + wait + rm -f on EXIT; explicit cleanup here so the
  # trap becomes a no-op for the normal path.
  trap - EXIT INT TERM
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -f "$log"

  TS_AUTH_URL="$url"
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

do_uninstall() {
  local removed=()

  if ! cmd_exists tailscale; then
    json_result "skip" "tailscale not installed"
    exit 2
  fi

  # Auth state — sensitive, default keep. Destroy => logout (drops node key);
  # keep => just bring the link down so it stops routing.
  if [[ "$(cfg_bool keep_tailscale_auth true)" == "true" ]]; then
    json_progress "bringing tailscale down"
    tailscale down >&2 2>&1 || true
    removed+=("tailscale down (auth kept)")
  else
    json_progress "logging out of tailscale"
    tailscale logout >&2 2>&1 || true
    removed+=("tailscale logout")
  fi

  if [[ "$(cfg_bool remove_packages false)" == "true" ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_uninstall tailscale
    else
      systemctl stop tailscaled >&2 2>&1 || true
      systemctl disable tailscaled >&2 2>&1 || true
      apt_purge tailscale
      rm -f /usr/share/keyrings/tailscale-archive-keyring.gpg \
            /etc/apt/sources.list.d/tailscale.list 2>/dev/null || true
    fi
    removed+=("tailscale package")
  fi

  json_result "ok" "$(IFS=', '; echo "${removed[*]}")"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
