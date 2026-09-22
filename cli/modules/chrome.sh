#!/usr/bin/env bash
# modules/chrome.sh — Chrome
# devlair module: chrome
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

_MACOS_APP="/Applications/Google Chrome.app"

_chrome_installed() {
  if [[ "$PLATFORM" == "macos" ]]; then
    [[ -d "$_MACOS_APP" ]]
  else
    cmd_exists google-chrome || cmd_exists google-chrome-stable
  fi
}

do_run() {
  if _chrome_installed; then
    json_result "ok" "already installed"
    return
  fi

  if [[ "$PLATFORM" == "macos" ]]; then
    brew_install --cask google-chrome
    json_install "chrome" "brew:cask:google-chrome" true
    json_result "ok" "installed via brew cask"
    return
  fi

  local arch
  arch=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
  if [[ "$arch" != "amd64" ]]; then
    json_result "skip" "no official Google Chrome build for $arch"
    return
  fi

  json_progress "installing chrome"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg >&2
  chmod a+r /etc/apt/keyrings/google-chrome.gpg
  echo "deb [arch=$arch signed-by=/etc/apt/keyrings/google-chrome.gpg] \
    https://dl.google.com/linux/chrome/deb/ stable main" \
    | tee /etc/apt/sources.list.d/google-chrome.list > /dev/null
  apt-get update -qq >&2
  apt-get install -y -qq google-chrome-stable >&2
  json_install "chrome" "apt:dl.google.com" true
  json_result "ok" "installed via apt"
}

do_check() {
  if _chrome_installed; then
    json_check "chrome installed" "ok" "installed"
  else
    json_check "chrome installed" "warn" "missing — required for claude-in-chrome and similar agentic browser tools"
  fi
}

do_uninstall() {
  local removed=()

  if [[ "$(cfg_bool remove_packages false)" == "true" ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_uninstall --cask google-chrome
      removed+=("google-chrome")
    else
      apt_purge google-chrome-stable
      rm -f /etc/apt/keyrings/google-chrome.gpg /etc/apt/sources.list.d/google-chrome.list 2>/dev/null || true
      removed+=("google-chrome + apt repo")
    fi
  fi

  if [[ ${#removed[@]} -eq 0 ]]; then
    json_result "skip" "nothing to remove"
    exit 2
  fi
  json_result "ok" "removed: $(IFS=', '; echo "${removed[*]}")"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
