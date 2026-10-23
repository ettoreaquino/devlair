#!/usr/bin/env bash
# modules/upgrade.sh — System and tool upgrades
# Not a regular init module — invoked by `devlair upgrade`.
#
# Every step reads the tool's version before and after and reports the diff via
# json_step, so a step that fails shows as warn with the version still in place
# instead of a blanket "updated".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

# Check mode: report what would be upgraded without doing anything.
if [[ "$MODE" == "check" ]]; then
  json_check "upgrade" "ok" "use 'devlair upgrade' to run"
  exit 0
fi

# _version TEXT -- first dotted version number in TEXT (empty when none).
_version() { grep -oE '[0-9]+(\.[0-9]+)+' <<<"$1" | head -1 || true; }

# tool_version CMD -- version of CMD as the current user, empty when missing.
tool_version() {
  cmd_exists "$1" || return 0
  _version "$("$1" --version 2>/dev/null || true)"
}

# user_version SCRIPT -- version printed by SCRIPT run as the target user.
user_version() { _version "$(_run_as_user "$1" 2>/dev/null || true)"; }

# ── System packages ──────────────────────────────────────────────────────────

_apt_upgradable() { apt list --upgradable 2>/dev/null | grep -c 'upgradable from' || true; }

upgrade_apt() {
  local rc=0 pending held gh_before docker_before
  gh_before=$(tool_version gh)
  docker_before=$(tool_version docker)

  json_progress "updating package lists"
  if ! apt-get update -qq >&2; then
    json_step "system packages" "" "" 1 "apt-get update failed"
  else
    pending=$(_apt_upgradable)
    json_progress "upgrading $pending system packages"
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq -o Dpkg::Options::=--force-confold >&2 || rc=$?
    held=$(_apt_upgradable)
    if [[ $rc -ne 0 ]]; then
      json_step "system packages" "" "" "$rc" "apt-get upgrade failed (exit $rc)"
    else
      local detail="$((pending - held)) upgraded"
      [[ $held -gt 0 ]] && detail+=", $held held back (run: sudo apt-get full-upgrade)"
      json_check "system packages" "ok" "$detail"
    fi
  fi

  if [[ "$PLATFORM" == "wsl" ]]; then
    apt-get install -y -qq wslu >&2 || json_step "wslu" "" "" $? "apt-get install wslu failed"
  fi

  # gh and docker come from apt repos, so the system upgrade above moved them.
  [[ -n "$gh_before" ]] && json_step "GitHub CLI" "$gh_before" "$(tool_version gh)" 0
  [[ -n "$docker_before" ]] && json_step "Docker" "$docker_before" "$(tool_version docker)" 0

  if [[ -f /var/run/reboot-required ]]; then
    STEP_WARNED=1
    json_check "reboot" "warn" "required to finish applying updates"
  fi
  return 0
}

upgrade_aws_linux() {
  # Only the bundled installer's layout; a distro or pip aws is left alone.
  [[ -d /usr/local/aws-cli ]] || return 0
  local before rc=0 reason=""
  before=$(tool_version aws)
  json_progress "upgrading AWS CLI"
  aws_cli_install --update || rc=$?
  case $rc in
    3) reason="signature did not verify; not installed" ;;
    4) reason="download failed" ;;
  esac
  json_step "AWS CLI" "$before" "$(tool_version aws)" "$rc" "$reason"
}

# ── Homebrew (macOS) ─────────────────────────────────────────────────────────

upgrade_brew() {
  if ! cmd_exists brew; then
    json_step "Homebrew" "" "" 1 "brew not found"
    return 0
  fi
  # Indexed arrays only: macOS /bin/bash is 3.2 (no associative arrays).
  local rc=0 pending i
  local -a tools=(gh aws uv bun fzf pyenv) before=()
  for i in "${!tools[@]}"; do before[i]=$(tool_version "${tools[i]}"); done

  json_progress "updating Homebrew"
  brew_run update --quiet >&2 || rc=$?
  if [[ $rc -ne 0 ]]; then
    json_step "Homebrew" "" "" "$rc" "brew update failed (exit $rc)"
    return 0
  fi
  pending=$(brew_run outdated --quiet 2>/dev/null | wc -l | tr -d ' ' || true)
  json_progress "upgrading $pending Homebrew packages"
  brew_run upgrade >&2 || rc=$?
  if [[ $rc -ne 0 ]]; then
    json_step "Homebrew" "" "" "$rc" "brew upgrade failed (exit $rc)"
  else
    json_check "Homebrew" "ok" "$pending formulae/casks upgraded"
  fi
  for i in "${!tools[@]}"; do
    [[ -n "${before[i]}" ]] && json_step "${tools[i]}" "${before[i]}" "$(tool_version "${tools[i]}")" 0
  done
  return 0
}

# ── User-level toolchains ────────────────────────────────────────────────────

upgrade_pyenv() {
  [[ -d "$USER_HOME/.pyenv" ]] || return 0
  local env="export PYENV_ROOT=\"$USER_HOME/.pyenv\" PATH=\"$USER_HOME/.pyenv/bin:\$PATH\";"
  local before rc=0 update="pyenv update &&"
  # Homebrew owns pyenv itself on macOS; `pyenv update` is the git-plugin path.
  [[ "$PLATFORM" == "macos" ]] && update=""
  before=$(user_version "$env pyenv global")
  json_progress "upgrading pyenv + Python"
  _run_as_user "$env $update pyenv install -s 3 && pyenv global \"\$(pyenv latest 3)\"" >&2 || rc=$?
  json_step "pyenv + Python" "$before" "$(user_version "$env pyenv global")" "$rc"
}

upgrade_nvm() {
  [[ -d "$USER_HOME/.nvm" ]] || return 0
  local env="export NVM_DIR=\"$USER_HOME/.nvm\"; source \"\$NVM_DIR/nvm.sh\";"
  local before rc=0
  before=$(user_version "$env nvm version 'lts/*'")
  json_progress "upgrading nvm + Node LTS"
  _run_as_user "$env nvm install --lts" >&2 || rc=$?
  json_step "nvm + Node LTS" "$before" "$(user_version "$env nvm version 'lts/*'")" "$rc"
}

upgrade_user_bin() {
  local label=$1 bin=$2 cmd=$3 before rc=0
  [[ -x "$bin" ]] || return 0
  before=$(user_version "\"$bin\" --version")
  json_progress "upgrading $label"
  _run_as_user "\"$bin\" $cmd" >&2 || rc=$?
  json_step "$label" "$before" "$(user_version "\"$bin\" --version")" "$rc"
}

# ── Run ──────────────────────────────────────────────────────────────────────

if [[ "$PLATFORM" == "macos" ]]; then
  upgrade_brew
else
  upgrade_apt
  upgrade_aws_linux
  # On macOS bun and uv come from Homebrew and were covered above.
  upgrade_user_bin "Bun" "$USER_HOME/.bun/bin/bun" "upgrade"
  upgrade_user_bin "uv" "$USER_HOME/.local/bin/uv" "self update"
fi
upgrade_pyenv
upgrade_nvm

if [[ $STEP_WARNED -eq 1 ]]; then
  json_result "warn" "upgrade finished with warnings"
else
  json_result "ok" "upgrade complete"
fi
exit 0
