#!/usr/bin/env bash
# modules/github.sh — GitHub SSH key
# devlair module: github
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

_run_as_user() {
  if [[ "$PLATFORM" == "macos" ]]; then
    bash -c "$1"
  else
    run_shell_as "$USERNAME" "$1"
  fi
}

do_run() {
  local gh_key="$USER_HOME/.ssh/id_ed25519_github"
  local ssh_conf="$USER_HOME/.ssh/config"

  if [[ -f "$gh_key" ]]; then
    json_result "skip" "key already exists"
    exit 2
  fi

  local email
  email=$(ctx_get_config github_email)
  if [[ -z "$email" ]]; then
    json_result "skip" "skipped"
    exit 2
  fi

  # Generate key as the user
  json_progress "generating SSH key"
  mkdir -p "$USER_HOME/.ssh"
  chmod 700 "$USER_HOME/.ssh"
  if [[ "$PLATFORM" == "macos" ]]; then
    ssh-keygen -t ed25519 -C "$email" -f "$gh_key" -N "" >&2
  else
    run_as "$USERNAME" ssh-keygen -t ed25519 -C "$email" -f "$gh_key" -N "" >&2
  fi

  # SSH config entry (idempotent)
  local conf_text=""
  [[ -f "$ssh_conf" ]] && conf_text=$(cat "$ssh_conf")
  if [[ "$conf_text" != *"Host github.com"* ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      cat >> "$ssh_conf" <<EOF

# GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile $gh_key
    IdentitiesOnly yes
    UseKeychain yes
    AddKeysToAgent yes
EOF
    else
      cat >> "$ssh_conf" <<EOF

# GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile $gh_key
    IdentitiesOnly yes
EOF
    fi
    chmod 600 "$ssh_conf"
    [[ "$PLATFORM" != "macos" ]] && chown_user "$ssh_conf"
  fi

  # Add key to macOS Keychain so it persists across reboots
  if [[ "$PLATFORM" == "macos" ]]; then
    ssh-add --apple-use-keychain "$gh_key" >&2 || true
  fi

  if [[ "$PLATFORM" == "macos" ]]; then
    bash -c "git config --global user.email \"$email\"" >&2
  else
    run_as "$USERNAME" git config --global user.email "$email" >&2
  fi
  local git_name
  git_name=$(ctx_get_config github_name)
  if [[ -n "$git_name" ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      bash -c "git config --global user.name \"$git_name\"" >&2
    else
      run_as "$USERNAME" git config --global user.name "$git_name" >&2
    fi
  fi
  if [[ "$PLATFORM" == "macos" ]]; then
    bash -c "git config --global init.defaultBranch main" >&2
  else
    run_as "$USERNAME" git config --global init.defaultBranch main >&2
  fi

  # Surface the public key and wait for the user to add it to GitHub.
  local pub
  pub=$(cat "${gh_key}.pub")
  json_auth_url "https://github.com/settings/ssh/new" "$pub"

  local poll_interval=3
  while true; do
    if _run_as_user "ssh -T git@github.com -o StrictHostKeyChecking=accept-new 2>&1" | grep -q "successfully authenticated"; then
      break
    fi
    sleep "$poll_interval"
  done

  json_result "ok" "connected"
}

do_check() {
  local key="$USER_HOME/.ssh/id_ed25519_github"
  if [[ -f "$key" ]]; then
    json_check "github ssh key" "ok"
  else
    json_check "github ssh key" "warn"
    return
  fi

  if _run_as_user "ssh -T git@github.com -o StrictHostKeyChecking=accept-new 2>&1" | grep -q "successfully authenticated"; then
    json_check "github connection" "ok"
  else
    json_check "github connection" "fail"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
