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

_AWS_CLI_GPG_KEY_URL="https://awscli.amazonaws.com/awscli-exe-linux-public-key.asc"

# _link_vscode_cli -- symlink the `code` CLI into ~/.devlair/bin, which is
# unconditionally first on PATH (see shell-aliases.zsh). This is more robust
# than depending on Homebrew's own cask shim or a shell-startup-time alias:
# it works regardless of PATH ordering, and re-runs (VS Code installed
# manually, pre-existing app, doctor/upgrade) always keep it up to date.
_link_vscode_cli() {
  local app_cli="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
  [[ -x "$app_cli" ]] || return 0
  local bin_dir="$USER_HOME/.devlair/bin"
  mkdir -p "$bin_dir"
  ln -sf "$app_cli" "$bin_dir/code"
  chown_user "$bin_dir/code"
  chown_user "$bin_dir"
}

do_run() {
  local -a installed=() skipped=()

  if [[ "$PLATFORM" == "macos" ]]; then
    ARCH=$(uname -m)
  else
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
  fi

  # ── uv ──────────────────────────────────────────────────────────────────────
  if cmd_exists uv; then
    skipped+=(uv)
  else
    json_progress "installing uv"
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_install uv
      json_install "uv" "brew:uv" true
    else
      local script
      script=$(download_script "https://astral.sh/uv/install.sh")
      _run_as_user "INSTALLER_NO_MODIFY_PATH=1 bash \"$script\"" >&2
      rm -f "$script"
      json_install "uv" "astral.sh" false
    fi
    installed+=(uv)
  fi

  # ── pyenv ───────────────────────────────────────────────────────────────────
  if [[ -d "$USER_HOME/.pyenv" ]]; then
    skipped+=(pyenv)
  else
    json_progress "installing pyenv"
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_install pyenv
    else
      apt_install libssl-dev libbz2-dev libreadline-dev libsqlite3-dev \
        libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev \
        libffi-dev liblzma-dev
      local script
      script=$(download_script "https://pyenv.run")
      _run_as_user "bash \"$script\"" >&2
      rm -f "$script"
    fi
    json_progress "installing Python via pyenv"
    _run_as_user "
      export PYENV_ROOT=\"$USER_HOME/.pyenv\"
      export PATH=\"\$PYENV_ROOT/bin:\$PATH\"
      eval \"\$(pyenv init -)\"
      pyenv install -s 3.12
      pyenv global 3.12
    " >&2
    if [[ "$PLATFORM" == "macos" ]]; then
      json_install "pyenv" "brew:pyenv" false
    else
      json_install "pyenv" "github.com/pyenv/pyenv" false
    fi
    installed+=(pyenv)
  fi

  # ── nvm / Node ──────────────────────────────────────────────────────────────
  if [[ -d "$USER_HOME/.nvm" ]]; then
    skipped+=(nvm)
  else
    json_progress "installing nvm + Node LTS"
    local script
    script=$(download_script "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh")
    _run_as_user "export PROFILE=/dev/null && bash \"$script\"" >&2
    rm -f "$script"
    _run_as_user "
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
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_install fzf
    else
      local fzf_dir="$USER_HOME/.fzf"
      _run_as_user "
        git clone --depth 1 https://github.com/junegunn/fzf.git \"$fzf_dir\"
        \"$fzf_dir/install\" --all --no-update-rc
      " >&2
    fi
    if [[ "$PLATFORM" == "macos" ]]; then
      json_install "fzf" "brew:fzf" true
    else
      json_install "fzf" "github.com/junegunn/fzf" true
    fi
    installed+=(fzf)
  fi

  # ── Docker ──────────────────────────────────────────────────────────────────
  if cmd_exists docker; then
    skipped+=(docker)
  elif [[ "$PLATFORM" == "wsl" || "$PLATFORM" == "macos" ]]; then
    json_progress "docker — install Docker Desktop separately, not via devlair" 50
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

  # Ensure user is in docker group (Linux only)
  if [[ "$PLATFORM" != "macos" ]] && cmd_exists docker; then
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
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_install gh
    else
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
      chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$ARCH signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
        https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      apt-get update -qq >&2
      apt-get install -y -qq gh >&2
    fi
    if [[ "$PLATFORM" == "macos" ]]; then
      json_install "gh" "brew:gh" true
    else
      json_install "gh" "apt:cli.github.com" true
    fi
    installed+=(gh)
  fi

  # ── AWS CLI v2 ───────────────────────────────────────────────────────────────
  if cmd_exists aws; then
    skipped+=(aws)
  else
    json_progress "installing aws cli"
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_install awscli
      json_install "aws" "brew:awscli" true
    else
      local aws_arch aws_base gpg_verified=false
      [[ "$ARCH" == "amd64" ]] && aws_arch="x86_64" || aws_arch="aarch64"
      aws_base="https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}"

      curl -fsSL "${aws_base}.zip" -o /tmp/awscliv2.zip >&2
      if cmd_exists gpg \
        && curl -fsSL "${aws_base}.zip.sig" -o /tmp/awscliv2.zip.sig 2>/dev/null \
        && curl -fsSL "$_AWS_CLI_GPG_KEY_URL" -o /tmp/aws-cli-key.asc 2>/dev/null; then
        gpg --batch --import /tmp/aws-cli-key.asc >&2 2>&1 || true
        if gpg --batch --verify /tmp/awscliv2.zip.sig /tmp/awscliv2.zip >&2 2>&1; then
          gpg_verified=true
        fi
      fi
      rm -f /tmp/awscliv2.zip.sig /tmp/aws-cli-key.asc
      unzip -qo /tmp/awscliv2.zip -d /tmp >&2
      /tmp/aws/install >&2
      rm -rf /tmp/awscliv2.zip /tmp/aws
      json_install "aws" "awscli.amazonaws.com" "$gpg_verified"
    fi
    installed+=(aws)
  fi

  # ── Bun ─────────────────────────────────────────────────────────────────────
  if cmd_exists bun || [[ -x "$USER_HOME/.bun/bin/bun" ]]; then
    skipped+=(bun)
  else
    json_progress "installing bun"
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_install bun
      json_install "bun" "brew:bun" true
    else
      local script
      script=$(download_script "https://bun.sh/install")
      _run_as_user "bash \"$script\"" >&2
      rm -f "$script"
      json_install "bun" "bun.sh" false
    fi
    installed+=(bun)
  fi

  # ── VS Code ──────────────────────────────────────────────────────────────────
  if cmd_exists code || [[ -d "/Applications/Visual Studio Code.app" ]]; then
    skipped+=(vscode)
    [[ "$PLATFORM" == "macos" ]] && _link_vscode_cli
  elif [[ "$PLATFORM" == "macos" ]]; then
    brew_install --cask visual-studio-code
    json_install "vscode" "brew:cask:visual-studio-code" true
    installed+=(vscode)
    _link_vscode_cli
  elif [[ "$PLATFORM" == "linux" ]]; then
    json_progress "installing vscode"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
      | gpg --dearmor -o /etc/apt/keyrings/microsoft.gpg >&2
    chmod a+r /etc/apt/keyrings/microsoft.gpg
    echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/microsoft.gpg] \
      https://packages.microsoft.com/repos/code stable main" \
      > /etc/apt/sources.list.d/vscode.list
    apt-get update -qq >&2
    apt-get install -y -qq code >&2
    json_install "vscode" "apt:packages.microsoft.com" true
    installed+=(vscode)
  else
    # WSL: VS Code is installed on the Windows side with Remote WSL extension
    skipped+=(vscode)
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

  if cmd_exists code || [[ -d "/Applications/Visual Studio Code.app" ]]; then
    json_check "vscode" "ok" "installed"
  else
    json_check "vscode" "warn" "missing"
  fi

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
    json_check "bun" "warn" "missing"
  fi
}

do_uninstall() {
  local removed=()
  local remove_packages
  remove_packages=$(cfg_bool remove_packages false)

  # ── User-level version managers (always removed) ──────────────────────────
  rm_user_path "$USER_HOME/.pyenv"
  rm_user_path "$USER_HOME/.nvm"
  rm_user_path "$USER_HOME/.bun"
  rm_user_path "$USER_HOME/.fzf"
  rm_user_path "$USER_HOME/.local/bin/uv"
  rm_user_path "$USER_HOME/.local/bin/uvx"
  [[ "$PLATFORM" == "macos" ]] && rm_user_path "$USER_HOME/.devlair/bin/code"

  if [[ "$remove_packages" == "true" ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_uninstall uv pyenv fzf gh awscli bun
      brew_uninstall --cask --quiet visual-studio-code
      removed+=("brew dev tools")
    else
      # Drop the user from the docker group, then purge docker + repos.
      if id -nG "$USERNAME" 2>/dev/null | grep -qw docker; then
        gpasswd -d "$USERNAME" docker >&2 2>&1 || true
      fi
      apt_purge docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin gh code
      rm -f /etc/apt/keyrings/docker.gpg /etc/apt/sources.list.d/docker.list 2>/dev/null || true
      rm -f /usr/share/keyrings/githubcli-archive-keyring.gpg /etc/apt/sources.list.d/github-cli.list 2>/dev/null || true
      rm -f /etc/apt/keyrings/microsoft.gpg /etc/apt/sources.list.d/vscode.list 2>/dev/null || true
      # AWS CLI v2 installs to /usr/local (not apt-managed).
      rm -rf /usr/local/aws-cli /usr/local/bin/aws /usr/local/bin/aws_completer 2>/dev/null || true
      removed+=("docker, gh, aws, vscode + apt repos")
    fi
  fi

  if [[ ${#removed[@]} -eq 0 ]]; then
    json_result "skip" "nothing to remove"
    exit 2
  fi
  json_result "ok" "removed: $(IFS=', '; echo "${removed[*]}")"
}

case "$MODE" in
  run)       do_run ;;
  check)     do_check ;;
  uninstall) do_uninstall ;;
  *)         json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
