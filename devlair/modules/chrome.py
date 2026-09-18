from pathlib import Path

from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair.features.audit import safe_log_install

LABEL = "Chrome"

_MACOS_APP = Path("/Applications/Google Chrome.app")

_CHROME_LINUX_KEYRING = "/etc/apt/keyrings/google-chrome.gpg"


def _linux_chrome_installed() -> bool:
    return runner.cmd_exists("google-chrome") or runner.cmd_exists("google-chrome-stable")


def _macos_chrome_installed() -> bool:
    return _MACOS_APP.exists()


def run(ctx: SetupContext) -> ModuleResult:
    if ctx.platform == "macos":
        if _macos_chrome_installed():
            return ModuleResult(status="ok", detail="already installed")
        console.print("    [muted]chrome...[/muted]")
        runner.run_shell_as(ctx.username, "brew install --cask --quiet google-chrome", quiet=True)
        safe_log_install(ctx.user_home, tool="chrome", source="brew:cask:google-chrome", verified=True)
        return ModuleResult(status="ok", detail="installed via brew cask")

    if _linux_chrome_installed():
        return ModuleResult(status="ok", detail="already installed")

    arch = runner.get_output("uname -m")
    if arch != "x86_64":
        return ModuleResult(status="skip", detail=f"no official Google Chrome build for {arch}")

    console.print("    [muted]chrome...[/muted]")
    runner.run_shell(
        f"""
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
            | gpg --dearmor -o {_CHROME_LINUX_KEYRING}
        chmod a+r {_CHROME_LINUX_KEYRING}
        echo "deb [arch=$(dpkg --print-architecture) signed-by={_CHROME_LINUX_KEYRING}] \
            https://dl.google.com/linux/chrome/deb/ stable main" \
            | tee /etc/apt/sources.list.d/google-chrome.list > /dev/null
        apt-get update -qq
        apt-get install -y -qq google-chrome-stable
    """,
        quiet=True,
    )
    safe_log_install(ctx.user_home, tool="chrome", source="apt:dl.google.com", verified=True)
    return ModuleResult(status="ok", detail="installed via apt")


def check() -> list[CheckItem]:
    installed = _linux_chrome_installed() or _macos_chrome_installed()
    return [
        CheckItem(
            label="chrome installed",
            status="ok" if installed else "warn",
            detail="installed"
            if installed
            else "missing — required for claude-in-chrome and similar agentic browser tools",
        ),
    ]
