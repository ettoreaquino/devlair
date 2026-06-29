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
  chown_user "$USER_HOME/.ssh"
  if _is_root; then
    run_as "$USERNAME" ssh-keygen -t ed25519 -C "$email" -f "$gh_key" -N "" >&2
  else
    ssh-keygen -t ed25519 -C "$email" -f "$gh_key" -N "" >&2
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
    chown_user "$ssh_conf"
  fi

  # Add key to macOS Keychain so it persists across reboots
  if [[ "$PLATFORM" == "macos" ]]; then
    if _is_root; then
      run_as "$USERNAME" ssh-add --apple-use-keychain "$gh_key" >&2 || true
    else
      ssh-add --apple-use-keychain "$gh_key" >&2 || true
    fi
  fi

  if _is_root; then
    run_as "$USERNAME" git config --global user.email "$email" >&2
  else
    git config --global user.email "$email" >&2
  fi
  local git_name
  git_name=$(ctx_get_config github_name)
  if [[ -n "$git_name" ]]; then
    if _is_root; then
      run_as "$USERNAME" git config --global user.name "$git_name" >&2
    else
      git config --global user.name "$git_name" >&2
    fi
  fi
  if _is_root; then
    run_as "$USERNAME" git config --global init.defaultBranch main >&2
  else
    git config --global init.defaultBranch main >&2
  fi

  # Surface the public key and wait for the user to add it to GitHub.
  local pub
  pub=$(cat "${gh_key}.pub")
  json_auth_url "https://github.com/settings/ssh/new" "$pub"

  # Poll until the key is accepted. `ssh -T git@github.com` always exits 1
  # (GitHub provides no shell), so capture its output with `|| true` and grep
  # the variable — piping straight to grep would, under `set -o pipefail`,
  # propagate ssh's non-zero exit and the loop would never break.
  #
  # The Ink UI sends SIGUSR1 when the user presses Enter to stop waiting. The
  # trap flips _auth_skip so the loop exits and reports a warn rather than
  # blocking forever when the key is added out-of-band (or never).
  local poll_interval=3 out
  local _auth_skip=0
  trap '_auth_skip=1' USR1
  while true; do
    out=$(_run_as_user "ssh -T git@github.com -o StrictHostKeyChecking=accept-new 2>&1" || true)
    if grep -q "successfully authenticated" <<<"$out"; then
      trap - USR1
      json_result "ok" "connected"
      return 0
    fi
    if (( _auth_skip )); then break; fi
    # `|| true`: SIGUSR1 interrupts sleep with a non-zero exit under `set -e`.
    sleep "$poll_interval" || true
    if (( _auth_skip )); then break; fi
  done
  trap - USR1

  json_result "warn" "key not verified yet — add it to GitHub, then run 'devlair doctor'"
}

do_check() {
  local key="$USER_HOME/.ssh/id_ed25519_github"
  if [[ -f "$key" ]]; then
    json_check "github ssh key" "ok"
  else
    json_check "github ssh key" "warn"
    return
  fi

  # See do_run: ssh -T always exits 1, so capture-then-grep to avoid pipefail.
  local out
  out=$(_run_as_user "ssh -T git@github.com -o StrictHostKeyChecking=accept-new 2>&1" || true)
  if grep -q "successfully authenticated" <<<"$out"; then
    json_check "github connection" "ok"
  else
    json_check "github connection" "fail"
  fi
}

do_uninstall() {
  local removed=() kept=()
  local gh_key="$USER_HOME/.ssh/id_ed25519_github"
  local ssh_conf="$USER_HOME/.ssh/config"

  # GitHub SSH key — sensitive, default keep.
  if [[ "$(cfg_bool keep_github_key true)" == "true" ]]; then
    [[ -f "$gh_key" ]] && kept+=("github ssh key")
  else
    rm_user_path "$gh_key"
    rm_user_path "${gh_key}.pub"
    # Drop the "Host github.com" block we appended to ~/.ssh/config.
    if [[ -f "$ssh_conf" ]] && grep -q "Host github.com" "$ssh_conf"; then
      json_progress "removing github host from ssh config"
      # Delete the "# GitHub" comment + the Host github.com stanza (until the
      # next blank line or EOF).
      awk '
        /^# GitHub$/ { skip=1; next }
        skip && /^Host github\.com$/ { skip=2; next }
        skip==2 && (/^$/ || /^Host /) { skip=0 }
        skip==2 { next }
        skip==1 { skip=0 }
        { print }
      ' "$ssh_conf" > "${ssh_conf}.tmp" && mv "${ssh_conf}.tmp" "$ssh_conf"
      chown_user "$ssh_conf"
      removed+=("ssh config github host")
    fi
    if [[ "$PLATFORM" == "macos" ]]; then
      run_shell_as "$USERNAME" "ssh-add -d \"$gh_key\" 2>/dev/null" >&2 || true
    fi
  fi

  # git identity — sensitive, default keep.
  if [[ "$(cfg_bool keep_git_identity true)" == "true" ]]; then
    kept+=("git identity")
  else
    json_progress "unsetting git identity"
    run_shell_as "$USERNAME" "
      git config --global --unset user.email 2>/dev/null
      git config --global --unset user.name 2>/dev/null
      git config --global --unset init.defaultBranch 2>/dev/null
      true
    " >&2 || true
    removed+=("git identity")
  fi

  local parts=()
  [[ ${#removed[@]} -gt 0 ]] && parts+=("removed: $(IFS=', '; echo "${removed[*]}")")
  [[ ${#kept[@]} -gt 0 ]] && parts+=("kept: $(IFS=', '; echo "${kept[*]}")")
  if [[ ${#parts[@]} -eq 0 ]]; then
    json_result "skip" "nothing to remove"
    exit 2
  fi
  json_result "ok" "$(IFS=' | '; echo "${parts[*]}")"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
