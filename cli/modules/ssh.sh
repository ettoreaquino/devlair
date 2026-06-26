#!/usr/bin/env bash
# cli/modules/ssh.sh — SSH
# devlair module: ssh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

SSHD_CONF="/etc/ssh/sshd_config.d/99-hardened.conf"

do_run() {
  # Get Tailscale IP for ListenAddress (optional on all platforms)
  local ts_ip listen
  ts_ip=$(tailscale ip -4 2>/dev/null || true)
  if [[ -n "$ts_ip" ]]; then
    listen="ListenAddress $ts_ip"
  else
    listen="# ListenAddress <set after tailscale connects>"
  fi

  # Back up existing config on all platforms before any writes
  if [[ -f /etc/ssh/sshd_config ]]; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
    chmod 600 /etc/ssh/sshd_config.bak
  fi

  if [[ "$PLATFORM" == "macos" ]]; then
    json_progress "enabling remote login"
    systemsetup -setremotelogin on >&2

    # Ensure sshd reads the drop-in directory on macOS
    local base_conf="/etc/ssh/sshd_config"
    if ! grep -q 'Include /etc/ssh/sshd_config.d/' "$base_conf" 2>/dev/null; then
      json_progress "enabling sshd drop-in includes"
      printf '\nInclude /etc/ssh/sshd_config.d/*.conf\n' >> "$base_conf"
    fi
  fi

  # Validate USERNAME before interpolating into sed
  if [[ ! "$USERNAME" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    json_result "fail" "invalid username: $USERNAME"
    exit 1
  fi

  # Write hardened sshd config from template (portable across Linux and macOS)
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

  # Restart sshd — launchctl on macOS, systemctl on Linux
  json_progress "restarting sshd"
  if [[ "$PLATFORM" == "macos" ]]; then
    sshd -t >&2
    launchctl kickstart -k system/com.openssh.sshd >&2
  else
    systemctl restart ssh >&2 || true
  fi

  if [[ -n "$ts_ip" ]]; then
    json_result "ok" "locked to $ts_ip"
  else
    json_result "ok" "open on all interfaces (set ListenAddress after Tailscale)"
  fi
}

do_check() {
  if [[ "$PLATFORM" == "macos" ]]; then
    if launchctl print system/com.openssh.sshd 2>/dev/null | grep -q 'state = running'; then
      json_check "sshd running" "ok"
    else
      json_check "sshd running" "fail"
    fi
  else
    local sshd_status
    sshd_status=$(systemctl is-active ssh 2>/dev/null || echo "inactive")
    if [[ "$sshd_status" == "active" ]]; then
      json_check "sshd running" "ok"
    else
      json_check "sshd running" "fail"
    fi
  fi

  if [[ -f "$SSHD_CONF" ]]; then
    json_check "99-hardened.conf" "ok" "present"
  else
    json_check "99-hardened.conf" "warn" "missing"
  fi
}

do_uninstall() {
  local removed=() kept=()

  # Remove the hardened drop-in.
  if [[ -f "$SSHD_CONF" ]]; then
    rm -f "$SSHD_CONF"
    removed+=("99-hardened.conf")
  fi

  # Restore the original sshd_config from the backup we made at install time.
  # The backup predates the macOS `Include` line, so restoring it also undoes that.
  if [[ -f /etc/ssh/sshd_config.bak ]]; then
    json_progress "restoring sshd_config from backup"
    mv /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
    chmod 644 /etc/ssh/sshd_config
    removed+=("sshd_config restored")
  fi

  # authorized_keys — sensitive, default keep (may contain keys devlair didn't add).
  local auth_keys="$USER_HOME/.ssh/authorized_keys"
  if [[ "$(cfg_bool keep_authorized_keys true)" == "true" ]]; then
    [[ -f "$auth_keys" ]] && kept+=("authorized_keys")
  else
    rm_user_path "$auth_keys"
  fi

  # Restart / disable remote login so the relaxed config takes effect.
  json_progress "restarting sshd"
  if [[ "$PLATFORM" == "macos" ]]; then
    systemsetup -setremotelogin off >&2 2>&1 || true
  else
    systemctl restart ssh >&2 2>&1 || true
  fi

  # NOTE: openssh-server is intentionally never purged, even with --remove
  # packages — doing so on a remote machine would lock the operator out.
  if [[ "$(cfg_bool remove_packages false)" == "true" ]]; then
    kept+=("openssh-server (lockout-safe)")
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
