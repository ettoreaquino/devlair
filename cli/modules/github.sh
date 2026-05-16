#!/usr/bin/env bash
# modules/github.sh — GitHub SSH key
# devlair module: github
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

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
  run_as "$USERNAME" ssh-keygen -t ed25519 -C "$email" -f "$gh_key" -N "" >&2

  # SSH config entry (idempotent)
  local conf_text=""
  [[ -f "$ssh_conf" ]] && conf_text=$(cat "$ssh_conf")
  if [[ "$conf_text" != *"Host github.com"* ]]; then
    cat >> "$ssh_conf" <<EOF

# GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile $gh_key
    IdentitiesOnly yes
EOF
    chmod 600 "$ssh_conf"
    chown_user "$ssh_conf"
  fi

  # Display public key for the user (via progress event)
  local pub
  pub=$(cat "${gh_key}.pub")
  json_progress "Add this public key to GitHub: $pub"

  # Test connection
  local connected=false
  if run_as "$USERNAME" ssh -T git@github.com -o StrictHostKeyChecking=accept-new >/dev/null 2>&1; then
    connected=true
  else
    # ssh -T returns exit 1 on success with "successfully authenticated" on stderr
    if run_as "$USERNAME" ssh -T git@github.com -o StrictHostKeyChecking=accept-new 2>&1 | grep -q "successfully authenticated"; then
      connected=true
    fi
  fi

  # Git global config
  run_as "$USERNAME" git config --global user.email "$email" >&2
  local git_name
  git_name=$(ctx_get_config github_name)
  if [[ -n "$git_name" ]]; then
    run_as "$USERNAME" git config --global user.name "$git_name" >&2
  fi
  run_as "$USERNAME" git config --global init.defaultBranch main >&2

  if [[ "$connected" == "true" ]]; then
    json_result "ok" "connected"
  else
    json_result "warn" "key added but connection test failed — check GitHub"
  fi
}

do_check() {
  local key="$USER_HOME/.ssh/id_ed25519_github"
  if [[ -f "$key" ]]; then
    json_check "github ssh key" "ok"
  else
    json_check "github ssh key" "warn"
    return
  fi

  if run_as "$USERNAME" ssh -T git@github.com -o StrictHostKeyChecking=no 2>&1 | grep -q "successfully authenticated"; then
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
