#!/usr/bin/env bash
# modules/zsh.sh — Zsh + Dracula
# devlair module: zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

do_run() {
  if [[ "$PLATFORM" == "macos" ]]; then
    cmd_exists zsh || brew_install zsh
  else
    cmd_exists zsh || apt_install zsh
  fi

  local zsh_bin
  zsh_bin=$(which zsh)

  # Set as default shell for the user
  local current_shell
  if [[ "$PLATFORM" == "macos" ]]; then
    if [[ ! "$USERNAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
      json_result "fail" "invalid username: $USERNAME"
      exit 1
    fi
    current_shell=$(dscl . -read "/Users/$USERNAME" UserShell 2>/dev/null | awk '{print $2}')
  else
    current_shell=$(getent passwd "$USERNAME" | cut -d: -f7)
  fi
  if [[ "$current_shell" != "$zsh_bin" ]]; then
    json_progress "setting zsh as default shell"
    if [[ "$PLATFORM" == "macos" ]] && ! _is_root; then
      # On macOS as non-root, omit the username arg so chsh uses PAM for the invoking user. As root, pass USERNAME explicitly to target the correct account.
      chsh -s "$zsh_bin" >&2
    else
      chsh -s "$zsh_bin" "$USERNAME" >&2
    fi
  fi

  local zim_home="$USER_HOME/.zim"
  local zimrc="$USER_HOME/.zimrc"
  local zshrc="$USER_HOME/.zshrc"
  local zshenv="$USER_HOME/.zshenv"

  # Write .zimrc
  json_progress "writing .zimrc"
  cp "$SCRIPT_DIR/configs/zimrc" "$zimrc"
  _is_root && chown_user "$zimrc"

  # Prevent system /etc/zsh/zshrc from calling compinit before zimfw
  if [[ ! -f "$zshenv" ]] || ! grep -q "skip_global_compinit" "$zshenv"; then
    cat > "$zshenv" <<'EOF'
# devlair — skip system compinit so zimfw completion module handles it
skip_global_compinit=1
EOF
    _is_root && chown_user "$zshenv"
  fi

  # Write .zshrc header (only if not already managed by devlair)
  if [[ ! -f "$zshrc" ]] || ! grep -q "devlair" "$zshrc"; then
    cp "$SCRIPT_DIR/configs/zshrc-header.sh" "$zshrc"
    _is_root && chown_user "$zshrc"
  fi

  # Bootstrap zimfw and install modules as the user
  json_progress "installing zimfw plugins"
  _run_as_user "
    export ZIM_HOME=\"$zim_home\"
    export ZDOTDIR=\"$USER_HOME\"
    mkdir -p \"\$ZIM_HOME\"
    curl -fsSL --create-dirs -o \"\$ZIM_HOME/zimfw.zsh\" \
        https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
    zsh -c 'source \"\$ZIM_HOME/zimfw.zsh\" install' 2>&1 || true
  " >&2 || true

  _is_root && chown_user "$zim_home"

  json_result "ok" "zsh with Dracula via zimfw"
}

do_check() {
  if cmd_exists zsh; then
    json_check "zsh installed" "ok" "installed"
  else
    json_check "zsh installed" "fail" "missing"
  fi

  if [[ -f "$USER_HOME/.zimrc" ]]; then
    json_check ".zimrc" "ok" "present"
  else
    json_check ".zimrc" "warn" "missing"
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
