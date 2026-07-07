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
  [[ "$zsh_bin" =~ ^(/opt/homebrew|/usr/local|/bin|/usr/bin)/ ]] || { json_result "fail" "unexpected zsh path: $zsh_bin"; exit 1; }

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
  # Record the original login shell (once) so `devlair uninstall` can restore it.
  if [[ "$current_shell" != "$zsh_bin" ]]; then
    local state_dir="$USER_HOME/.devlair"
    local state_file="$state_dir/state.json"
    mkdir -p "$state_dir"
    chown_user "$state_dir"
    if [[ ! -f "$state_file" ]] || ! jq -e '.original_shell' "$state_file" >/dev/null 2>&1; then
      update_json "$state_file" "$(jq -n --arg s "$current_shell" '{original_shell:$s}')"
      chown_user "$state_file"
    fi
  fi

  if [[ "$current_shell" != "$zsh_bin" ]]; then
    json_progress "setting zsh as default shell"
    if [[ "$PLATFORM" == "macos" ]]; then
      # chsh on macOS requires PAM auth even in a subprocess with piped stdin,
      # causing a credential failure. dscl avoids PAM and works without a TTY.
      # As root: call directly. As non-root: use sudo with cached creds (-n
      # prevents prompting; credentials should be cached from the pre-flight
      # sudo -v call that ran before Ink started).
      if _is_root; then
        dscl . -create "/Users/$USERNAME" UserShell "$zsh_bin" >&2
      else
        sudo -n dscl . -create "/Users/$USERNAME" UserShell "$zsh_bin" 2>/dev/null \
          || json_progress "note: could not set default shell; run 'chsh -s $zsh_bin' to set it manually"
      fi
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
  chown_user "$zimrc"

  # Prevent system /etc/zsh/zshrc from calling compinit before zimfw
  if [[ ! -f "$zshenv" ]] || ! grep -q "skip_global_compinit" "$zshenv"; then
    cat > "$zshenv" <<'EOF'
# devlair — skip system compinit so zimfw completion module handles it
skip_global_compinit=1
EOF
    chown_user "$zshenv"
  fi

  # Write / refresh the devlair-managed .zshrc header. Devlair owns the region
  # above shell.sh's aliases marker, so the header is re-applied on every run —
  # otherwise template changes (e.g. the minimal-arrow prompt) never reach a
  # machine that an older devlair already provisioned. shell.sh owns everything
  # from the aliases marker down and rewrites it on its own pass; here we only
  # refresh the header above it.
  json_progress "writing .zshrc header"
  local aliases_marker="# ── devlair aliases ─"  # must match shell.sh's MARKER
  if [[ -f "$zshrc" ]] && grep -qF "$aliases_marker" "$zshrc"; then
    # Refresh the header in place, preserving the aliases block below it (so a
    # `--only zsh` run doesn't drop aliases that shell.sh isn't there to rewrite).
    local aliases_block
    aliases_block=$(awk -v m="$aliases_marker" 'index($0, m){seen=1} seen' "$zshrc")
    { cat "$SCRIPT_DIR/configs/zshrc-header.sh"; printf '%s\n' "$aliases_block"; } > "$zshrc"
  else
    cp "$SCRIPT_DIR/configs/zshrc-header.sh" "$zshrc"
  fi
  chown_user "$zshrc"

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

do_uninstall() {
  local removed=()
  local zshrc="$USER_HOME/.zshrc"

  # Restore the original login shell BEFORE removing zsh, so the user is never
  # left with a missing login shell. Prefer the recorded original; fall back to
  # /bin/bash on Linux. On macOS, only act when we have a recorded value.
  local orig_shell=""
  local state_file="$USER_HOME/.devlair/state.json"
  [[ -f "$state_file" ]] && orig_shell=$(jq -r '.original_shell // empty' "$state_file" 2>/dev/null || true)

  # Validate that the recorded shell is listed in /etc/shells to prevent an
  # attacker-controlled state.json from pointing chsh/dscl at an arbitrary binary.
  if [[ -n "$orig_shell" ]] && ! grep -qxF "$orig_shell" /etc/shells 2>/dev/null; then orig_shell=""; fi

  local target_shell=""
  if [[ -n "$orig_shell" && -x "$orig_shell" ]]; then
    target_shell="$orig_shell"
  elif [[ "$PLATFORM" != "macos" && -x /bin/bash ]]; then
    target_shell="/bin/bash"
  fi

  if [[ -n "$target_shell" ]]; then
    json_progress "restoring login shell to $target_shell"
    if [[ "$PLATFORM" == "macos" ]]; then
      if _is_root; then
        dscl . -create "/Users/$USERNAME" UserShell "$target_shell" >&2 2>&1 || true
      else
        sudo -n dscl . -create "/Users/$USERNAME" UserShell "$target_shell" >&2 2>&1 || true
      fi
    else
      chsh -s "$target_shell" "$USERNAME" >&2 2>&1 || true
    fi
    removed+=("login shell → $target_shell")
  fi

  # Strip the devlair-managed header block from .zshrc (re-downloads zimfw and
  # sources ~/.zim/init.zsh, which we are about to delete). Only touch it when
  # the distinctive devlair header is present.
  if [[ -f "$zshrc" ]] && head -1 "$zshrc" | grep -q "devlair — managed zsh config"; then
    json_progress "removing devlair header from .zshrc"
    # Drop lines from the header marker through the final `source "$ZIM_HOME/init.zsh"`.
    awk '
      /devlair — managed zsh config/ { skip=1; next }
      skip && /source "\$ZIM_HOME\/init\.zsh"/ { skip=0; next }
      skip { next }
      { print }
    ' "$zshrc" > "${zshrc}.tmp" && mv "${zshrc}.tmp" "$zshrc"
    chown_user "$zshrc"
    # If nothing meaningful remains, drop the file entirely.
    [[ -n "$(tr -d '[:space:]' < "$zshrc")" ]] || rm -f "$zshrc"
    removed+=("zsh header")
  fi

  rm_user_path "$USER_HOME/.zim"
  rm_user_path "$USER_HOME/.zimrc"
  # Only remove .zshenv if it's the devlair-managed one.
  if [[ -f "$USER_HOME/.zshenv" ]] && grep -q "skip_global_compinit" "$USER_HOME/.zshenv"; then
    rm_user_path "$USER_HOME/.zshenv"
  fi

  if [[ "$(cfg_bool remove_packages false)" == "true" ]]; then
    if [[ "$PLATFORM" == "macos" ]]; then
      brew_uninstall zsh
    else
      apt_purge zsh
    fi
    removed+=("zsh package")
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
