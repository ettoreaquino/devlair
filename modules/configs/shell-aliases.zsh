# ── devlair aliases ───────────────────────────────────────────────────────────
alias ll='ls -lah --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias ports='sudo ss -tulnp'
alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
alias update='sudo apt update && sudo apt upgrade -y'
alias ts='tailscale status'
alias t='tmux new-session -A -s dev'
alias bcat='bat --paging=never'
tmx() {
  if [ "$1" = "new" ]; then
    shift
    ~/.devlair/bin/tmx-new "$@"
  else
    tmux attach-session -t "$1"
  fi
}

# ── devlair bin ───────────────────────────────────────────────────────────────
export PATH="$HOME/.devlair/bin:$PATH"

# ── pyenv ─────────────────────────────────────────────────────────────────────
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh 2>/dev/null || true)"

# ── nvm ───────────────────────────────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# ── bun ───────────────────────────────────────────────────────────────────────
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# ── fzf ───────────────────────────────────────────────────────────────────────
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# ── WSL browser ──────────────────────────────────────────────────────────────
# Redirect xdg-open / BROWSER to the Windows default browser via wslview
if [ -n "$WSL_DISTRO_NAME" ] && command -v wslview &>/dev/null; then
  export BROWSER=wslview
fi

# ── Claude Code ───────────────────────────────────────────────────────────────
export CLAUDE_CODE_DISABLE_1M_CONTEXT=1
# Use 1M context for a single session: CLAUDE_CODE_DISABLE_1M_CONTEXT=0 claude

# ── login banner ──────────────────────────────────────────────────────────────
if [ -t 0 ]; then
  _dl_p=$'\e[38;2;189;147;249m'
  _dl_b=$'\e[1m'
  _dl_r=$'\e[0m'
  _dl_W=52
  _dl_IW=$(( _dl_W - 2 ))
  _dl_host=${HOST:-$(hostname)}
  _dl_ip=$(tailscale ip -4 2>/dev/null || echo "TS off")
  _dl_disk=$(df -h / | awk 'NR==2{print $3"/"$2}')
  _dl_mem=$(free -h | awk 'NR==2{gsub(/i/,"",$3); gsub(/i/,"",$2); print $3"/"$2}')
  _dl_dashes=${(l:_dl_IW::─:)}

  # row helper — prints │ content padded to inner width │
  _dl_row() { printf '%s│%s%-*s%s│%s\n' "$_dl_p" "$_dl_r" "$_dl_IW" "$1" "$_dl_p" "$_dl_r"; }

  # devlair logo (medium decoration, same width as banner)
  _dl_g=$'\e[38;2;98;114;164m'
  # 25 = gradient(4) + space(2) + brand(13) + space(2) + gradient(4)
  _dl_lpad=$(( (_dl_IW - 25) / 2 ))
  _dl_rpad=$(( _dl_IW - 25 - _dl_lpad ))
  printf '%s╭%s╮%s\n' "$_dl_p" "$_dl_dashes" "$_dl_r"
  printf '%s│%s%*s%s░▒▓█%s  %sd e v l a i r%s  %s█▓▒░%s%*s%s│%s\n' \
    "$_dl_p" "$_dl_r" "$_dl_lpad" "" "$_dl_g" "$_dl_r" \
    "$_dl_b" "$_dl_r" "$_dl_g" "$_dl_r" "$_dl_rpad" "" "$_dl_p" "$_dl_r"
  printf '%s╰%s╯%s\n' "$_dl_p" "$_dl_dashes" "$_dl_r"

  # top border: ╭─ hostname ─────╮
  _dl_fill=$(( _dl_IW - ${#_dl_host} - 3 ))
  printf '%s╭─ %s%s%s %s╮%s\n' "$_dl_p" "$_dl_b$_dl_r" "$_dl_host" "$_dl_p" "${_dl_dashes:0:_dl_fill}" "$_dl_r"

  _dl_row "  ${_dl_ip}  disk ${_dl_disk}  mem ${_dl_mem}"
  _dl_row ""

  # live tmux sessions
  _dl_live=()
  while IFS=: read -r name _rest; do
    _dl_live+=("$name")
  done < <(tmux list-sessions 2>/dev/null | head -5)

  if [ ${#_dl_live[@]} -gt 0 ]; then
    _dl_row "  tmux:"
    for _dl_s in "${_dl_live[@]}"; do
      if [ ${#_dl_s} -gt 16 ]; then _dl_sdisplay="${_dl_s:0:15}…"; else _dl_sdisplay="$_dl_s"; fi
      _dl_cmd="tmx ${_dl_s}"
      if [ ${#_dl_cmd} -gt 20 ]; then _dl_cmd="${_dl_cmd:0:19}…"; fi
      _dl_left="    ${_dl_sdisplay}"
      _dl_right="→ ${_dl_cmd} "
      _dl_gap=$(( _dl_IW - ${#_dl_left} - ${#_dl_right} ))
      [ "$_dl_gap" -lt 1 ] && _dl_gap=1
      _dl_row "${_dl_left}${(l:_dl_gap:: :)}${_dl_right}"
    done
  else
    _dl_row "  no sessions — type 't' to start"
  fi

  # synced drives
  _dl_svcs=(~/.config/systemd/user/rclone-*.service(N))
  if [ ${#_dl_svcs[@]} -gt 0 ]; then
    _dl_row ""
    _dl_row "  syncs:"
    for _dl_svc in "${_dl_svcs[@]}"; do
      _dl_sname="${_dl_svc:t:r}"
      _dl_sname="${_dl_sname#rclone-}"
      _dl_lp=""
      while IFS= read -r _dl_line; do
        case "$_dl_line" in
          Description=rclone\ bisync\ *)
            _dl_desc="${_dl_line#Description=rclone bisync }"
            _dl_lp="${_dl_desc#* -> }"
            ;;
        esac
      done < "$_dl_svc"
      [ -z "$_dl_lp" ] && continue
      _dl_lp="${_dl_lp/#$HOME/\~}"
      if [ ${#_dl_lp} -gt 28 ]; then _dl_lp="${_dl_lp:0:27}…"; fi
      if [ ${#_dl_sname} -gt 10 ]; then _dl_sname="${_dl_sname:0:9}…"; fi
      _dl_left="    ${_dl_lp}"
      _dl_right="← ${_dl_sname} "
      _dl_gap=$(( _dl_IW - ${#_dl_left} - ${#_dl_right} ))
      [ "$_dl_gap" -lt 1 ] && _dl_gap=1
      _dl_row "${_dl_left}${(l:_dl_gap:: :)}${_dl_right}"
    done
  fi

  # claw (PicoCLAW agent)
  _dl_claw_compose="$HOME/.devlair/claw/docker-compose.yml"
  if [ -f "$_dl_claw_compose" ]; then
    _dl_row ""
    _dl_row "  claw:"
    _dl_evo=$(docker inspect -f '{{.State.Status}}' evolution 2>/dev/null)
    _dl_pico=$(docker inspect -f '{{.State.Status}}' picoclaw 2>/dev/null)
    if [ "$_dl_pico" = "running" ] && [ "$_dl_evo" = "running" ]; then
      _dl_alfile="$HOME/.devlair/claw/allowlist.json"
      if [ -f "$_dl_alfile" ]; then
        _dl_alcount=$(grep -c '"+' "$_dl_alfile" 2>/dev/null || true)
      else
        _dl_alcount=0
      fi
      _dl_left="    ● up  ${_dl_alcount} phones"
      _dl_right="→ devlair claw "
    else
      _dl_down=""
      [ "$_dl_pico" != "running" ] && _dl_down="picoclaw"
      [ "$_dl_evo" != "running" ] && _dl_down="${_dl_down:+$_dl_down }evolution"
      _dl_left="    ○ ${_dl_down} down"
      _dl_right="→ devlair claw --start "
    fi
    _dl_gap=$(( _dl_IW - ${#_dl_left} - ${#_dl_right} ))
    [ "$_dl_gap" -lt 1 ] && _dl_gap=1
    _dl_row "${_dl_left}${(l:_dl_gap:: :)}${_dl_right}"
  fi

  # channels (named claude-telegram sessions from manifest)
  _dl_manifest="$HOME/.claude/channels/manifest.json"
  if [ -f "$_dl_manifest" ] && command -v jq &>/dev/null; then
    _dl_ch_count=$(jq '.sessions | length' "$_dl_manifest" 2>/dev/null || echo 0)
    if [ "$_dl_ch_count" -gt 0 ]; then
      _dl_row ""
      _dl_row "  channels:"
      while IFS=$'\t' read -r _dl_ch_name _dl_ch_state; do
        [ -z "$_dl_ch_name" ] && continue
        _dl_ch_dot="○"
        if [ -d "$_dl_ch_state" ]; then
          grep -sq "TELEGRAM_BOT_TOKEN=." "$_dl_ch_state/.env" 2>/dev/null && _dl_ch_token=yes || _dl_ch_token=no
          jq -e '.allowFrom | length > 0' "$_dl_ch_state/access.json" >/dev/null 2>&1 && _dl_ch_allow=yes || _dl_ch_allow=no
          [ "$_dl_ch_token" = "yes" ] && [ "$_dl_ch_allow" = "yes" ] && _dl_ch_dot="●"
        fi
        [ ${#_dl_ch_name} -gt 12 ] && _dl_ch_name="${_dl_ch_name:0:11}…"
        _dl_left="    ${_dl_ch_dot} ${_dl_ch_name}"
        _dl_right="→ tmx ${_dl_ch_name} "
        _dl_gap=$(( _dl_IW - ${#_dl_left} - ${#_dl_right} ))
        [ "$_dl_gap" -lt 1 ] && _dl_gap=1
        _dl_row "${_dl_left}${(l:_dl_gap:: :)}${_dl_right}"
      done < <(jq -r '.sessions[] | [.name, .state_dir] | @tsv' "$_dl_manifest" 2>/dev/null)
    fi
  fi

  # bottom border
  printf '%s╰%s╯%s\n' "$_dl_p" "$_dl_dashes" "$_dl_r"
fi
