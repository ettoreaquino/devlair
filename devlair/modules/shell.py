import shutil
from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "Shell aliases"

ZSHRC_ALIASES = """
# ── devlair aliases ───────────────────────────────────────────────────────────
alias ll='ls -lah --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias ports='sudo ss -tulnp'
alias dps='docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"'
alias update='sudo apt update && sudo apt upgrade -y'
alias ts='tailscale status'
alias t='tmux new-session -A -s dev'
alias bcat='bat --paging=never'
tmx() { tmux attach-session -t "$1"; }

# ── devlair bin ───────────────────────────────────────────────────────────────
export PATH="$HOME/.devlair/bin:$PATH"

# ── pyenv ─────────────────────────────────────────────────────────────────────
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh 2>/dev/null || true)"

# ── nvm ───────────────────────────────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# ── fzf ───────────────────────────────────────────────────────────────────────
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# ── Claude Code ───────────────────────────────────────────────────────────────
export CLAUDE_CODE_DISABLE_1M_CONTEXT=1
# Use 1M context for a single session: CLAUDE_CODE_DISABLE_1M_CONTEXT=0 claude

# ── login banner ──────────────────────────────────────────────────────────────
if [ -t 0 ]; then
  _dl_p=$'\\e[38;2;189;147;249m'
  _dl_b=$'\\e[1m'
  _dl_r=$'\\e[0m'
  _dl_W=52
  _dl_IW=$(( _dl_W - 2 ))
  _dl_host=${HOST:-$(hostname)}
  _dl_ip=$(tailscale ip -4 2>/dev/null || echo "TS off")
  _dl_disk=$(df -h / | awk 'NR==2{print $3"/"$2}')
  _dl_mem=$(free -h | awk 'NR==2{gsub(/i/,"",$3); gsub(/i/,"",$2); print $3"/"$2}')
  _dl_dashes=${(l:_dl_IW::─:)}

  # row helper — prints │ content padded to inner width │
  _dl_row() { printf '%s│%s%-*s%s│%s\\n' "$_dl_p" "$_dl_r" "$_dl_IW" "$1" "$_dl_p" "$_dl_r"; }

  # top border: ╭─ hostname ─────╮
  _dl_fill=$(( _dl_IW - ${#_dl_host} - 3 ))
  printf '%s╭─ %s%s%s %s╮%s\\n' "$_dl_p" "$_dl_b$_dl_r" "$_dl_host" "$_dl_p" "${_dl_dashes:0:_dl_fill}" "$_dl_r"

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
          Description=rclone\\ bisync\\ *)
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

  # channels (Telegram via Claude Code)
  _dl_ch_enabled=$(jq -r '.channelsEnabled // false' ~/.claude/settings.json 2>/dev/null)
  _dl_tg_allowed=$(jq -r '.allowedChannelPlugins[]? | select(.plugin=="telegram") | .plugin' ~/.claude/settings.json 2>/dev/null)
  _dl_row ""
  _dl_row "  channels:"
  if [ "$_dl_ch_enabled" = "true" ] && [ "$_dl_tg_allowed" = "telegram" ]; then
    _dl_left="    ● telegram"
    _dl_right="→ claude-telegram "
  else
    _dl_left="    ○ telegram off"
    _dl_right="→ devlair claude --channels "
  fi
  _dl_gap=$(( _dl_IW - ${#_dl_left} - ${#_dl_right} ))
  [ "$_dl_gap" -lt 1 ] && _dl_gap=1
  _dl_row "${_dl_left}${(l:_dl_gap:: :)}${_dl_right}"

  # bottom border
  printf '%s╰%s╯%s\\n' "$_dl_p" "$_dl_dashes" "$_dl_r"
fi
"""

MARKER = "# ── devlair aliases ─"


def _clean_zshrc(text: str) -> str:
    """Remove lines injected by third-party installers (nvm, uv, pyenv) outside the devlair block."""
    clean_lines = []
    skip_patterns = [
        '. "$HOME/.local/bin/env"',
        "export NVM_DIR=",
        "\\. \"$NVM_DIR/nvm.sh\"",
        "\\. \"$NVM_DIR/bash_completion\"",
        "# This loads nvm",
    ]
    in_devlair_block = False
    for line in text.splitlines(keepends=True):
        if MARKER in line:
            in_devlair_block = True
        if in_devlair_block:
            clean_lines.append(line)
            continue
        if any(p in line for p in skip_patterns):
            continue
        clean_lines.append(line)
    return "".join(clean_lines)


def run(ctx: SetupContext) -> ModuleResult:
    zshrc = ctx.user_home / ".zshrc"

    existing = zshrc.read_text() if zshrc.exists() else ""

    if MARKER in existing:
        # Clean any third-party pollution and refresh the aliases block
        header = existing[:existing.index(MARKER)]
        header = _clean_zshrc(header)
        zshrc.write_text(header + ZSHRC_ALIASES.lstrip("\n"))
        shutil.chown(zshrc, ctx.username, ctx.username)
        return ModuleResult(status="ok", detail="aliases refreshed in .zshrc")

    # Clean any junk before appending
    cleaned = _clean_zshrc(existing)
    zshrc.write_text(cleaned + ZSHRC_ALIASES)
    shutil.chown(zshrc, ctx.username, ctx.username)

    return ModuleResult(status="ok", detail="aliases added to .zshrc")


def check() -> list[CheckItem]:
    zshrc = Path.home() / ".zshrc"
    has_aliases = zshrc.exists() and MARKER in zshrc.read_text()
    return [CheckItem(label="shell aliases", status="ok" if has_aliases else "warn")]
