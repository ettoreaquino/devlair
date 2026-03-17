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
  _dl_purple=$'\\e[38;2;189;147;249m'
  _dl_bold=$'\\e[1m'
  _dl_reset=$'\\e[0m'
  _dl_W=52
  _dl_host=$(hostname)
  _dl_ip=$(tailscale ip -4 2>/dev/null || echo "TS off")
  _dl_disk=$(df -h / | awk 'NR==2{print $3"/"$2}')
  _dl_mem=$(free -h | awk 'NR==2{gsub(/i/,"",$3); gsub(/i/,"",$2); print $3"/"$2}')

  _dl_pad() { local s="$1" w="$2"; printf '%s%*s' "$s" $((w - ${#s})) ''; }

  # top border with hostname
  _dl_title=" ${_dl_host} "
  _dl_tlen=${#_dl_title}
  _dl_fill=$(( _dl_W - 2 - _dl_tlen - 1 ))
  printf '%s╭─%s%s%s%s%*s╮%s\\n' "$_dl_purple" "$_dl_reset" "$_dl_bold" "$_dl_title" "$_dl_purple" "$_dl_fill" '' "$_dl_reset" | sed "s/ /─/g; s/─${_dl_host}─/ ${_dl_host} /; s/─╮/─╮/"

  # system info row
  _dl_info="  ${_dl_ip}  disk ${_dl_disk}  mem ${_dl_mem}"
  printf '%s│%s%s%s│%s\\n' "$_dl_purple" "$_dl_reset" "$(_dl_pad "$_dl_info" $((_dl_W - 2)))" "$_dl_purple" "$_dl_reset"

  # blank line
  printf '%s│%s%*s%s│%s\\n' "$_dl_purple" "$_dl_reset" $((_dl_W - 2)) '' "$_dl_purple" "$_dl_reset"

  # live tmux sessions
  _dl_live=()
  while IFS=: read -r name _rest; do
    _dl_live+=("$name")
  done < <(tmux list-sessions 2>/dev/null | head -5)

  # saved sessions from resurrect (not currently live)
  _dl_saved=()
  _dl_resfile=""
  [ -f "$HOME/.local/share/tmux/resurrect/last" ] && _dl_resfile="$HOME/.local/share/tmux/resurrect/last"
  [ -f "$HOME/.tmux/resurrect/last" ] && _dl_resfile="$HOME/.tmux/resurrect/last"
  if [ -n "$_dl_resfile" ] && _dl_reslink=$(readlink -f "$_dl_resfile" 2>/dev/null) && [ -f "$_dl_reslink" ]; then
    while IFS= read -r _dl_sname; do
      _dl_is_live=0
      for _dl_l in "${_dl_live[@]}"; do [ "$_dl_l" = "$_dl_sname" ] && _dl_is_live=1 && break; done
      [ "$_dl_is_live" -eq 0 ] && _dl_saved+=("$_dl_sname")
    done < <(awk -F'\\t' '$1=="window" {print $2}' "$_dl_reslink" | sort -u | head -3)
  fi

  if [ ${#_dl_live[@]} -gt 0 ] || [ ${#_dl_saved[@]} -gt 0 ]; then
    _dl_line="  tmux:"
    printf '%s│%s%s%s│%s\\n' "$_dl_purple" "$_dl_reset" "$(_dl_pad "$_dl_line" $((_dl_W - 2)))" "$_dl_purple" "$_dl_reset"

    for _dl_s in "${_dl_live[@]}"; do
      if [ ${#_dl_s} -gt 16 ]; then _dl_sdisplay="${_dl_s:0:15}…"; else _dl_sdisplay="$_dl_s"; fi
      _dl_cmd="tmux a -t ${_dl_s}"
      if [ ${#_dl_cmd} -gt 20 ]; then _dl_cmd="${_dl_cmd:0:19}…"; fi
      _dl_line="    ${_dl_sdisplay}"
      _dl_right="→ ${_dl_cmd}"
      _dl_gap=$(( _dl_W - 2 - ${#_dl_line} - ${#_dl_right} - 1 ))
      [ "$_dl_gap" -lt 1 ] && _dl_gap=1
      _dl_full="${_dl_line}$(printf '%*s' "$_dl_gap" '')${_dl_right} "
      printf '%s│%s%s%s│%s\\n' "$_dl_purple" "$_dl_reset" "$(_dl_pad "$_dl_full" $((_dl_W - 2)))" "$_dl_purple" "$_dl_reset"
    done

    if [ ${#_dl_saved[@]} -gt 0 ]; then
      _dl_line="  saved:"
      printf '%s│%s%s%s│%s\\n' "$_dl_purple" "$_dl_reset" "$(_dl_pad "$_dl_line" $((_dl_W - 2)))" "$_dl_purple" "$_dl_reset"
      for _dl_s in "${_dl_saved[@]}"; do
        if [ ${#_dl_s} -gt 16 ]; then _dl_sdisplay="${_dl_s:0:15}…"; else _dl_sdisplay="$_dl_s"; fi
        _dl_line="    ${_dl_sdisplay}"
        _dl_right="Prefix + C-r to restore"
        _dl_gap=$(( _dl_W - 2 - ${#_dl_line} - ${#_dl_right} - 1 ))
        [ "$_dl_gap" -lt 1 ] && _dl_gap=1
        _dl_full="${_dl_line}$(printf '%*s' "$_dl_gap" '')${_dl_right} "
        printf '%s│%s%s%s│%s\\n' "$_dl_purple" "$_dl_reset" "$(_dl_pad "$_dl_full" $((_dl_W - 2)))" "$_dl_purple" "$_dl_reset"
      done
    fi
  else
    _dl_line="  no sessions — type 't' to start"
    printf '%s│%s%s%s│%s\\n' "$_dl_purple" "$_dl_reset" "$(_dl_pad "$_dl_line" $((_dl_W - 2)))" "$_dl_purple" "$_dl_reset"
  fi

  # bottom border
  printf '%s╰%*s╯%s\\n' "$_dl_purple" $((_dl_W - 2)) '' "$_dl_reset" | sed 's/ /─/g'
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
