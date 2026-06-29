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
  # Homebrew is shared infrastructure used by software well beyond devlair, so
  # plain uninstall never touches it. `devlair uninstall --purge` removes it in
  # a pre-Ink step (macOsPurgeHomebrew, full TTY for sudo) — by the time this
  # module runs, brew is already gone, so just report it accurately.
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
