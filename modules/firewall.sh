#!/usr/bin/env bash
# modules/firewall.sh — Firewall + Fail2Ban
# devlair module: firewall
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

FAIL2BAN_JAIL="/etc/fail2ban/jail.local"

do_run() {
  # UFW
  json_progress "configuring firewall"
  ufw --force reset >&2 || true
  ufw default deny incoming >&2
  ufw default allow outgoing >&2
  echo 'y' | ufw enable >&2

  # Fail2Ban
  local existing=""
  [[ -f "$FAIL2BAN_JAIL" ]] && existing=$(cat "$FAIL2BAN_JAIL")
  if [[ "$existing" != *"[sshd]"* ]]; then
    json_progress "writing fail2ban config"
    mkdir -p "$(dirname "$FAIL2BAN_JAIL")"
    cp "$SCRIPT_DIR/configs/fail2ban-jail.conf" "$FAIL2BAN_JAIL"
  fi

  systemctl enable fail2ban >&2
  systemctl restart fail2ban >&2

  json_result "ok" "ufw active, fail2ban running"
}

do_check() {
  local ufw_status
  ufw_status=$(ufw status 2>/dev/null || echo "")
  if echo "$ufw_status" | grep -qi "status: active"; then
    json_check "ufw" "ok" "active"
  else
    json_check "ufw" "fail" "inactive"
  fi

  local f2b_status
  f2b_status=$(systemctl is-active fail2ban 2>/dev/null || echo "inactive")
  if [[ "$f2b_status" == "active" ]]; then
    json_check "fail2ban" "ok" "active"
  else
    json_check "fail2ban" "fail" "$f2b_status"
  fi

  # Check Evolution API UFW rule (only if claw is configured)
  if [[ -f "$USER_HOME/.devlair/claw/docker-compose.yml" ]]; then
    if echo "$ufw_status" | grep -q "8080" && echo "$ufw_status" | grep -q "100.64.0.0/10"; then
      json_check "evolution-api ufw rule" "ok" "present"
    else
      json_check "evolution-api ufw rule" "warn" "missing — run devlair init --only claw"
    fi
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
