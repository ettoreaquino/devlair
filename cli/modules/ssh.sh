#!/usr/bin/env bash
# modules/ssh.sh — SSH
# devlair module: ssh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

SSHD_CONF="/etc/ssh/sshd_config.d/99-hardened.conf"

do_run() {
  # Back up existing config
  if [[ -f /etc/ssh/sshd_config ]]; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
  fi

  # Get Tailscale IP for ListenAddress
  local ts_ip listen
  ts_ip=$(tailscale ip -4 2>/dev/null || true)
  if [[ -n "$ts_ip" ]]; then
    listen="ListenAddress $ts_ip"
  else
    listen="# ListenAddress <set after tailscale connects>"
  fi

  # Write hardened sshd config from template
  json_progress "writing hardened sshd config"
  mkdir -p "$(dirname "$SSHD_CONF")"
  sed -e "s|%%LISTEN_ADDRESS%%|$listen|" \
      -e "s|%%USERNAME%%|$USERNAME|" \
      "$SCRIPT_DIR/configs/sshd-hardened.conf.tmpl" > "$SSHD_CONF"

  # SSH key directory
  local ssh_dir="$USER_HOME/.ssh"
  mkdir -p "$ssh_dir"
  chmod 700 "$ssh_dir"
  local auth_keys="$ssh_dir/authorized_keys"
  touch "$auth_keys"
  chmod 600 "$auth_keys"
  chown_user "$ssh_dir"
  chown_user "$auth_keys"

  # Add public key from config if provided and authorized_keys is empty
  if [[ ! -s "$auth_keys" ]]; then
    local pub_key
    pub_key=$(ctx_get_config ssh_pubkey)
    if [[ -n "$pub_key" ]]; then
      case "$pub_key" in
        ssh-ed25519*|ssh-rsa*|ecdsa-sha2-*|sk-*)
          printf '%s\n' "$pub_key" >> "$auth_keys"
          chown_user "$auth_keys"
          ;;
        *)
          json_result "warn" "key skipped — does not look like a valid SSH public key"
          return
          ;;
      esac
    fi
  fi

  systemctl restart ssh >&2 || true

  if [[ -n "$ts_ip" ]]; then
    json_result "ok" "locked to $ts_ip"
  else
    json_result "ok" "open on all interfaces (set ListenAddress after Tailscale)"
  fi
}

do_check() {
  local sshd_status
  sshd_status=$(systemctl is-active ssh 2>/dev/null || echo "inactive")
  if [[ "$sshd_status" == "active" ]]; then
    json_check "sshd running" "ok"
  else
    json_check "sshd running" "fail"
  fi

  if [[ -f "$SSHD_CONF" ]]; then
    json_check "99-hardened.conf" "ok" "present"
  else
    json_check "99-hardened.conf" "warn" "missing"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
