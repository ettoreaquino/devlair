#!/usr/bin/env bash
# modules/zsh.sh — Zsh + Dracula
# devlair module: zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

do_run() {
  # Install zsh if missing
  if ! cmd_exists zsh; then
    apt_install zsh
  fi

  local zsh_bin
  zsh_bin=$(which zsh)

  # Set as default shell for the user
  local current_shell
  current_shell=$(getent passwd "$USERNAME" | cut -d: -f7)
  if [[ "$current_shell" != "$zsh_bin" ]]; then
    json_progress "setting zsh as default shell"
    chsh -s "$zsh_bin" "$USERNAME" >&2
  fi

  local zim_home="$USER_HOME/.zim"
  local zimrc="$USER_HOME/.zimrc"
  local zshrc="$USER_HOME/.zshrc"
  local zshenv="$USER_HOME/.zshenv"

  # Write .zimrc
  json_progress "writing .zimrc"
  cp "$SCRIPT_DIR/configs/zimrc" "$zimrc"
  chown_user "$zimrc"

  # Prevent system /etc/zsh/zshrc from calling compinit before zimfw
  if [[ ! -f "$zshenv" ]] || ! grep -q "skip_global_compinit" "$zshenv"; then
    cat > "$zshenv" <<'EOF'
# devlair — skip system compinit so zimfw completion module handles it
skip_global_compinit=1
EOF
    chown_user "$zshenv"
  fi

  # Write .zshrc header (only if not already managed by devlair)
  if [[ ! -f "$zshrc" ]] || ! grep -q "devlair" "$zshrc"; then
    cp "$SCRIPT_DIR/configs/zshrc-header.sh" "$zshrc"
    chown_user "$zshrc"
  fi

  # Bootstrap zimfw and install modules as the user
  json_progress "installing zimfw plugins"
  run_shell_as "$USERNAME" "
    export ZIM_HOME=\"$zim_home\"
    export ZDOTDIR=\"$USER_HOME\"
    mkdir -p \"\$ZIM_HOME\"
    curl -fsSL --create-dirs -o \"\$ZIM_HOME/zimfw.zsh\" \
        https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
    zsh -c 'source \"\$ZIM_HOME/zimfw.zsh\" install' 2>&1 || true
  " >&2 || true

  chown_user "$zim_home"

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
