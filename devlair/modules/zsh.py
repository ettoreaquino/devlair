import shutil
from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner
from devlair.console import console

LABEL = "Zsh + Dracula"

ZIMRC = """\
# Modules
zmodule environment
zmodule input
zmodule termtitle
zmodule zsh-users/zsh-completions --fpath src
zmodule completion

# Dracula theme
zmodule dracula/zsh --source dracula.zsh-theme

# Productivity
zmodule zsh-users/zsh-autosuggestions
zmodule zsh-users/zsh-syntax-highlighting
"""

ZSHENV = """\
# devlair — skip system compinit so zimfw completion module handles it
skip_global_compinit=1
"""

ZSHRC_HEADER = """\
# devlair — managed zsh config
export EDITOR=vim
export LANG=en_US.UTF-8

# Path
export PATH="$HOME/.local/bin:$PATH"

# zimfw
ZIM_HOME="$HOME/.zim"
if [[ ! -e "$ZIM_HOME/zimfw.zsh" ]]; then
  curl -fsSL --create-dirs -o "$ZIM_HOME/zimfw.zsh" \\
    https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
fi
if [[ ! "$ZIM_HOME/init.zsh" -nt "$HOME/.zimrc" ]]; then
  source "$ZIM_HOME/zimfw.zsh" init -q
fi
source "$ZIM_HOME/init.zsh"
"""


def run(ctx: SetupContext) -> ModuleResult:
    # Install zsh if missing
    if not runner.cmd_exists("zsh"):
        runner.apt_install("zsh", quiet=True)

    zsh_bin = runner.get_output("which zsh")

    # Set as default shell for the user
    current_shell = runner.get_output(f"getent passwd {ctx.username} | cut -d: -f7")
    if current_shell != zsh_bin:
        runner.run(["chsh", "-s", zsh_bin, ctx.username])

    zim_home = ctx.user_home / ".zim"
    zimrc = ctx.user_home / ".zimrc"
    zshrc = ctx.user_home / ".zshrc"

    # Write .zimrc
    zimrc.write_text(ZIMRC)
    shutil.chown(zimrc, ctx.username, ctx.username)

    # Prevent system /etc/zsh/zshrc from calling compinit before zimfw
    zshenv = ctx.user_home / ".zshenv"
    if not zshenv.exists() or "skip_global_compinit" not in zshenv.read_text():
        zshenv.write_text(ZSHENV)
        shutil.chown(zshenv, ctx.username, ctx.username)

    # Write .zshrc header (only if not already managed by devlair)
    if not zshrc.exists() or "devlair" not in zshrc.read_text():
        zshrc.write_text(ZSHRC_HEADER)
        shutil.chown(zshrc, ctx.username, ctx.username)

    # Bootstrap zimfw and install modules as the user
    runner.run_shell_as(
        ctx.username,
        f"""
        export ZIM_HOME="{zim_home}"
        export ZDOTDIR="{ctx.user_home}"
        mkdir -p "$ZIM_HOME"
        curl -fsSL --create-dirs -o "$ZIM_HOME/zimfw.zsh" \
            https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
        zsh -c 'source "$ZIM_HOME/zimfw.zsh" install' 2>&1 || true
        """,
        quiet=True,
    )

    shutil.chown(zim_home, ctx.username, ctx.username)

    return ModuleResult(status="ok", detail="zsh with Dracula via zimfw")


def check() -> list[CheckItem]:
    zsh_ok = runner.cmd_exists("zsh")
    return [
        CheckItem(label="zsh installed", status="ok" if zsh_ok else "fail"),
        CheckItem(
            label=".zimrc",
            status="ok" if Path("~/.zimrc").expanduser().exists() else "warn",
            detail="present" if Path("~/.zimrc").expanduser().exists() else "missing",
        ),
    ]
