#!/usr/bin/env bash
# modules/devtools.sh — Dev tools
# devlair module: devtools
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

# AWS CLI v2 public GPG key URL
_AWS_CLI_GPG_KEY_URL="https://awscli.amazonaws.com/awscli-exe-linux-public-key.asc"

do_run() {
  local -a installed=() skipped=()
  local ARCH
  ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")

  # ── uv ──────────────────────────────────────────────────────────────────────
  if cmd_exists uv; then
    skipped+=(uv)
  else
    json_progress "installing uv"
    local script
    script=$(download_script "https://astral.sh/uv/install.sh")
    run_shell_as "$USERNAME" "INSTALLER_NO_MODIFY_PATH=1 bash \"$script\"" >&2
    rm -f "$script"
    json_install "uv" "astral.sh" false
    installed+=(uv)
  fi

  # ── pyenv ───────────────────────────────────────────────────────────────────
  if [[ -d "$USER_HOME/.pyenv" ]]; then
    skipped+=(pyenv)
  else
    json_progress "installing pyenv"
    apt_install libssl-dev libbz2-dev libreadline-dev libsqlite3-dev \
      libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev \
      libffi-dev liblzma-dev
    local script
    script=$(download_script "https://pyenv.run")
    run_shell_as "$USERNAME" "bash \"$script\"" >&2
    rm -f "$script"
    json_progress "installing Python via pyenv"
    run_shell_as "$USERNAME" "
      export PYENV_ROOT=\"$USER_HOME/.pyenv\"
      export PATH=\"\$PYENV_ROOT/bin:\$PATH\"
      eval \"\$(pyenv init -)\"
      pyenv install -s 3
      pyenv global \"\$(pyenv latest 3)\"
    " >&2
    json_install "pyenv" "pyenv.run" false
    installed+=(pyenv)
  fi

  # ── nvm / Node ──────────────────────────────────────────────────────────────
  if [[ -d "$USER_HOME/.nvm" ]]; then
    skipped+=(nvm)
  else
    json_progress "installing nvm + Node LTS"
    local script
    script=$(download_script "https://raw.githubusercontent.com/nvm-sh/nvm/HEAD/install.sh")
    run_shell_as "$USERNAME" "export PROFILE=/dev/null && bash \"$script\"" >&2
    rm -f "$script"
    run_shell_as "$USERNAME" "
      export NVM_DIR=\"$USER_HOME/.nvm\"
      source \"\$NVM_DIR/nvm.sh\"
      nvm install --lts
    " >&2
    json_install "nvm" "github.com/nvm-sh/nvm" false
    installed+=(nvm+node)
  fi

  # ── fzf ─────────────────────────────────────────────────────────────────────
  if cmd_exists fzf; then
    skipped+=(fzf)
  else
    json_progress "installing fzf"
    local fzf_dir="$USER_HOME/.fzf"
    run_shell_as "$USERNAME" "
      git clone --depth 1 https://github.com/junegunn/fzf.git \"$fzf_dir\"
      \"$fzf_dir/install\" --all --no-update-rc
    " >&2
    json_install "fzf" "github.com/junegunn/fzf" true
    installed+=(fzf)
  fi

  # ── Docker ──────────────────────────────────────────────────────────────────
  if cmd_exists docker; then
    skipped+=(docker)
  elif [[ "$PLATFORM" == "wsl" ]]; then
    json_progress "docker — install Docker Desktop on Windows, not inside WSL" 50
    skipped+=(docker)
  else
    json_progress "installing docker"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg >&2
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq >&2
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >&2
    systemctl enable docker >&2
    json_install "docker" "apt:docker.com" true
    installed+=(docker)
  fi

  # Ensure user is in docker group
  if cmd_exists docker; then
    local groups
    groups=$(id -nG "$USERNAME" 2>/dev/null || true)
    if [[ ! " $groups " == *" docker "* ]]; then
      usermod -aG docker "$USERNAME" >&2
    fi
  fi

  # ── GitHub CLI ──────────────────────────────────────────────────────────────
  if cmd_exists gh; then
    skipped+=(gh)
  else
    json_progress "installing gh"
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$ARCH signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
      https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update -qq >&2
    apt-get install -y -qq gh >&2
    json_install "gh" "apt:cli.github.com" true
    installed+=(gh)
  fi

  # ── AWS CLI v2 (with GPG signature verification) ────────────────────────────
  if cmd_exists aws; then
    skipped+=(aws)
  else
    json_progress "installing aws cli"
    local arch aws_arch aws_base gpg_verified=false
    arch=$ARCH
    [[ "$arch" == "amd64" ]] && aws_arch="x86_64" || aws_arch="aarch64"
    aws_base="https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}"

    curl -fsSL "${aws_base}.zip" -o /tmp/awscliv2.zip >&2
    if cmd_exists gpg; then
      curl -fsSL "${aws_base}.zip.sig" -o /tmp/awscliv2.zip.sig >&2
      curl -fsSL "$_AWS_CLI_GPG_KEY_URL" -o /tmp/aws-cli-key.asc >&2
      gpg --batch --import /tmp/aws-cli-key.asc >&2 2>&1 || true
      if gpg --batch --verify /tmp/awscliv2.zip.sig /tmp/awscliv2.zip >&2 2>&1; then
        gpg_verified=true
      fi
      rm -f /tmp/awscliv2.zip.sig /tmp/aws-cli-key.asc
    fi
    unzip -qo /tmp/awscliv2.zip -d /tmp >&2
    /tmp/aws/install >&2
    rm -rf /tmp/awscliv2.zip /tmp/aws
    json_install "aws" "awscli.amazonaws.com" "$gpg_verified"
    installed+=(aws)
  fi

  # ── Bun ─────────────────────────────────────────────────────────────────────
  if cmd_exists bun || [[ -x "$USER_HOME/.bun/bin/bun" ]]; then
    skipped+=(bun)
  else
    json_progress "installing bun"
    local script
    script=$(download_script "https://bun.sh/install")
    run_shell_as "$USERNAME" "bash \"$script\"" >&2
    rm -f "$script"
    json_install "bun" "bun.sh" false
    installed+=(bun)
  fi

  # Build result detail
  local parts=()
  [[ ${#installed[@]} -gt 0 ]] && parts+=("installed: $(IFS=,; echo "${installed[*]}")")
  [[ ${#skipped[@]} -gt 0 ]] && parts+=("skipped: $(IFS=,; echo "${skipped[*]}")")
  json_result "ok" "$(IFS=' | '; echo "${parts[*]}")"
}

do_check() {
  for tool in docker gh aws fzf; do
    if cmd_exists "$tool"; then
      json_check "$tool" "ok" "installed"
    else
      json_check "$tool" "fail" "missing"
    fi
  done

  if [[ -d "$USER_HOME/.pyenv" ]]; then
    json_check "pyenv" "ok"
  else
    json_check "pyenv" "warn"
  fi

  if [[ -d "$USER_HOME/.nvm" ]]; then
    json_check "nvm" "ok"
  else
    json_check "nvm" "warn"
  fi

  if cmd_exists bun || [[ -x "$USER_HOME/.bun/bin/bun" ]]; then
    json_check "bun" "ok" "installed"
  else
    json_check "bun" "warn" "missing — required for Claude Code channels"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
