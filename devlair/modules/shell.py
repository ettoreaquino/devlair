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
alias cat='bat --paging=never'

# ── pyenv ─────────────────────────────────────────────────────────────────────
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh 2>/dev/null || true)"

# ── nvm ───────────────────────────────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# ── fzf ───────────────────────────────────────────────────────────────────────
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# ── login banner ──────────────────────────────────────────────────────────────
_devlair_banner() {
  local host ip disk mem
  host=$(hostname)
  ip=$(tailscale ip -4 2>/dev/null || echo "TS off")
  disk=$(df -h / | awk 'NR==2{print $3"/"$2}')
  mem=$(free -h | awk 'NR==2{print $3"/"$2}')
  echo ""
  echo "  $(tput bold)$host$(tput sgr0)  |  $ip"
  echo "  disk: $disk  |  mem: $mem"
  echo "  type 't' to start tmux"
  echo ""
}
_devlair_banner
"""

MARKER = "# ── devlair aliases ─"


def run(ctx: SetupContext) -> ModuleResult:
    zshrc = ctx.user_home / ".zshrc"

    # Read existing content (zsh module may have already written a header)
    existing = zshrc.read_text() if zshrc.exists() else ""

    if MARKER in existing:
        return ModuleResult(status="skip", detail="aliases already in .zshrc")

    with zshrc.open("a") as f:
        f.write(ZSHRC_ALIASES)
    shutil.chown(zshrc, ctx.username, ctx.username)

    return ModuleResult(status="ok", detail="aliases added to .zshrc")


def check() -> list[CheckItem]:
    zshrc = Path("~/.zshrc").expanduser()
    has_aliases = zshrc.exists() and MARKER in zshrc.read_text()
    return [CheckItem(label="shell aliases", status="ok" if has_aliases else "warn")]
