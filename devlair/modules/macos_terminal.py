import os
import pwd
from pathlib import Path

from devlair import runner
from devlair.context import CheckItem, ModuleResult, SetupContext

LABEL = "Terminal.app Dracula"

_DRACULA_URL = "https://raw.githubusercontent.com/dracula/terminal-app/master/Dracula.terminal"


def _open_terminal_file(username: str, filepath: Path) -> None:
    """Open a .terminal file so Terminal.app imports the profile.

    Uses launchctl asuser when running as root so the open command reaches
    the user's Aqua session; falls back to sudo -u otherwise.
    """
    uid = pwd.getpwnam(username).pw_uid
    if os.geteuid() == 0:
        runner.run_shell(f'launchctl asuser {uid} /usr/bin/open "{filepath}"', quiet=True)
    else:
        runner.run_shell_as(username, f'open "{filepath}"', quiet=True)


def _default_profile(username: str) -> str:
    return runner.get_output(
        f'sudo -u "{username}" defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true'
        if os.geteuid() == 0
        else 'defaults read com.apple.Terminal "Default Window Settings" 2>/dev/null || true'
    ).strip()


def run(ctx: SetupContext) -> ModuleResult:
    if _default_profile(ctx.username) == "Dracula":
        return ModuleResult(status="ok", detail="Dracula already default")

    theme_file = runner.safe_tempfile(suffix=".terminal")
    try:
        runner.run_shell(f'curl -fsSL "{_DRACULA_URL}" -o "{theme_file}"', quiet=True)
        _open_terminal_file(ctx.username, theme_file)
        runner.run_shell_as(
            ctx.username,
            """
            sleep 1
            defaults write com.apple.Terminal "Default Window Settings" "Dracula"
            defaults write com.apple.Terminal "Startup Window Settings" "Dracula"
            """,
            quiet=True,
        )
    finally:
        theme_file.unlink(missing_ok=True)

    return ModuleResult(status="ok", detail="Dracula theme imported and set as default")


def check() -> list[CheckItem]:
    current = runner.get_output(
        "defaults read com.apple.Terminal 'Default Window Settings' 2>/dev/null || true"
    ).strip()
    ok = current == "Dracula"
    return [
        CheckItem(
            label="Terminal.app Dracula",
            status="ok" if ok else "warn",
            detail="Dracula is default" if ok else f"current: {current or 'none'}",
        )
    ]
