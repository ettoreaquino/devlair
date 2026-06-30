#!/usr/bin/env bash
# modules/homebrew.sh — Homebrew preamble (macOS only)
# devlair module: homebrew
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
MODE=${1:-run}

do_run() {
  if cmd_exists brew; then
    json_result "skip" "already installed"
    exit 2
  fi
  # Check known paths directly in case PATH wasn't propagated by the pre-flight.
  local _brew_bin
  for _brew_bin in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$_brew_bin" ]]; then
      eval "$($_brew_bin shellenv 2>/dev/null)" || export PATH="$(dirname "$_brew_bin"):${PATH}"
      if cmd_exists brew; then
        json_result "skip" "already installed"
        exit 2
      fi
    fi
  done
  brew_ensure
  json_install "homebrew" "raw.githubusercontent.com/Homebrew/install" false
  json_result "ok" "Homebrew ready"
}

do_check() {
  if cmd_exists brew; then
    json_check "homebrew" "ok" "$(brew --version 2>/dev/null | head -1)"
  else
    json_check "homebrew" "fail" "not installed"
  fi
}

do_uninstall() {
  # Homebrew is shared infrastructure used by software well beyond devlair.
  # Plain uninstall never touches it. Under `--purge`, the CLI removes it LAST,
  # *after* Ink exits (macOsPurgeHomebrew, full TTY for sudo) so the modules can
  # still use brew to uninstall their packages — and it drops this module from
  # the in-Ink teardown loop, so do_uninstall only runs on the keep path here.
  if ! cmd_exists brew; then
    json_result "ok" "Homebrew removed"
    return
  fi
  json_result "skip" "Homebrew left installed"
  exit 2
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
