#!/usr/bin/env bash
# modules/upgrade.sh — System and tool upgrades
# Not a regular init module — invoked by `devlair upgrade`.
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

# ── System packages ──────────────────────────────────────────────────────────

json_progress "updating package lists"
apt-get update -qq >&2 || true

json_progress "upgrading system packages"
apt-get upgrade -y -qq >&2 || true

# WSL extras
if [[ "$PLATFORM" == "wsl" ]]; then
  apt-get install -y -qq wslu >&2 || true
fi
json_check "system packages" "ok" "updated"

# ── GitHub CLI ────────────────────────────────────────────────────────────────

if cmd_exists gh; then
  json_progress "upgrading GitHub CLI"
  apt-get install -y -qq gh >&2 || true
  json_check "GitHub CLI" "ok" "$(gh --version 2>/dev/null | head -1 || echo 'updated')"
fi

# ── AWS CLI ───────────────────────────────────────────────────────────────────

if cmd_exists aws; then
  json_progress "upgrading AWS CLI"
  arch=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
  aws_arch="x86_64"
  [[ "$arch" != "amd64" ]] && aws_arch="aarch64"
  (
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" -o /tmp/awscliv2.zip
    unzip -qo /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install --update
    rm -rf /tmp/awscliv2.zip /tmp/aws
  ) >&2 || true
  json_check "AWS CLI" "ok" "$(aws --version 2>/dev/null | cut -d' ' -f1 || echo 'updated')"
fi

# ── Docker ────────────────────────────────────────────────────────────────────

if cmd_exists docker; then
  json_progress "upgrading Docker"
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >&2 || true
  json_check "Docker" "ok" "$(docker --version 2>/dev/null || echo 'updated')"
fi

# ── pyenv + Python ────────────────────────────────────────────────────────────

if [[ -d "$USER_HOME/.pyenv" ]]; then
  json_progress "upgrading pyenv + Python"
  run_shell_as "$USERNAME" \
    "export PYENV_ROOT=\"$USER_HOME/.pyenv\" && export PATH=\"\$PYENV_ROOT/bin:\$PATH\" \
    && pyenv update && pyenv install -s 3 && pyenv global \"\$(pyenv latest 3)\"" \
    >&2 || true
  json_check "pyenv + Python" "ok" "updated"
fi

# ── nvm + Node ────────────────────────────────────────────────────────────────

if [[ -d "$USER_HOME/.nvm" ]]; then
  json_progress "upgrading nvm + Node LTS"
  run_shell_as "$USERNAME" \
    "export NVM_DIR=\"$USER_HOME/.nvm\" && source \"\$NVM_DIR/nvm.sh\" && nvm install --lts" \
    >&2 || true
  json_check "nvm + Node LTS" "ok" "updated"
fi

# ── rclone ────────────────────────────────────────────────────────────────────

if cmd_exists rclone; then
  json_progress "upgrading rclone"
  tmp=$(download_script "https://rclone.org/install.sh")
  bash "$tmp" >&2 || true
  rm -f "$tmp"
  json_check "rclone" "ok" "$(rclone --version 2>/dev/null | head -1 || echo 'updated')"
fi

# ── Bun ───────────────────────────────────────────────────────────────────────

if [[ -x "$USER_HOME/.bun/bin/bun" ]]; then
  json_progress "upgrading Bun"
  run_shell_as "$USERNAME" "$USER_HOME/.bun/bin/bun upgrade" >&2 || true
  json_check "Bun" "ok" "$("$USER_HOME/.bun/bin/bun" --version 2>/dev/null || echo 'updated')"
fi

# ── uv ────────────────────────────────────────────────────────────────────────

if cmd_exists uv; then
  json_progress "upgrading uv"
  run_shell_as "$USERNAME" "uv self update" >&2 || true
  json_check "uv" "ok" "$(uv --version 2>/dev/null || echo 'updated')"
fi

json_result "ok" "upgrade complete"
exit 0
