#!/usr/bin/env bash
# cli/modules/system.sh — System update
# devlair module: system
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

ESSENTIALS=(
  curl wget git vim htop tmux unzip
  net-tools build-essential ca-certificates gnupg jq
  tree rsync zsh bat fzf locales
)

# Linux-only essentials. These packages either ship systemd-managed
# postinst scripts (openssh-server, fail2ban) or require kernel features
# (ufw needs netfilter, avahi-daemon is mDNS) that don't apply under
# WSL's systemd-less default. Installing them on WSL leaves dpkg in a
# broken state, poisoning every later apt-get install. The dedicated
# ssh and firewall modules — both platforms={"linux"} — cover these on
# bare Linux already.
LINUX_ESSENTIALS=( openssh-server ufw fail2ban avahi-daemon )

# Excludes from ESSENTIALS: net-tools, build-essential, ca-certificates, locales
# (Linux/apt-specific; macOS handles these via system frameworks and Xcode CLT)
MACOS_ESSENTIALS=( git curl wget vim htop tmux unzip jq tree rsync zsh bat fzf gnupg )

do_run() {
  if [[ "$PLATFORM" == "macos" ]]; then
    brew_ensure
    json_progress "updating Homebrew"
    brew update --quiet >&2
    json_progress "upgrading packages"
    brew upgrade --quiet >&2
    brew_install "${MACOS_ESSENTIALS[@]}"
    json_result "ok" "packages up to date"
    return
  fi

  json_progress "updating package lists"
  apt-get update -qq >&2
  json_progress "upgrading packages"
  apt-get upgrade -y -qq >&2
  apt_install "${ESSENTIALS[@]}"

  if [[ "$PLATFORM" == "linux" ]]; then
    apt_install "${LINUX_ESSENTIALS[@]}"
  fi

  # WSL extras: wslu provides wslview for opening URLs in the Windows browser
  if [[ "$PLATFORM" == "wsl" ]]; then
    apt_install wslu
  fi

  # Ensure UTF-8 locale is available (bare WSL ships with C/POSIX only)
  locale-gen en_US.UTF-8 >&2 || true
  update-locale LANG=en_US.UTF-8 >&2 || true

  json_result "ok" "packages up to date"
}

do_check() {
  local checks=( "git:git" "curl:curl" "tmux:tmux" "zsh:zsh" )
  if [[ "$PLATFORM" == "linux" ]]; then
    checks+=( "ufw:ufw" "fail2ban:fail2ban-client" )
  fi
  if [[ "$PLATFORM" == "macos" ]]; then
    checks+=( "brew:brew" )
  fi
  for pair in "${checks[@]}"; do
    label="${pair%%:*}"
    cmd="${pair##*:}"
    if cmd_exists "$cmd"; then
      json_check "$label" "ok" "installed"
    else
      json_check "$label" "fail" "missing"
    fi
  done
}

# Packages safe to purge on uninstall — clearly "extra" tooling devlair adds.
# Deliberately conservative: base packages (curl, git, ca-certificates, gnupg,
# build-essential, jq, openssh-server, …) are PROTECTED and never purged, since
# apt and the uninstall process itself depend on them.
SAFE_PURGE=( htop tree bat net-tools )
MACOS_SAFE_PURGE=( htop tree bat )

do_uninstall() {
  if [[ "$(cfg_bool remove_packages false)" != "true" ]]; then
    json_result "skip" "base packages left installed (protected)"
    exit 2
  fi

  if [[ "$PLATFORM" == "macos" ]]; then
    brew_uninstall "${MACOS_SAFE_PURGE[@]}"
  else
    apt_purge "${SAFE_PURGE[@]}"
    [[ "$PLATFORM" == "wsl" ]] && apt_purge wslu
  fi

  json_result "ok" "removed extra packages (base packages preserved)"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
