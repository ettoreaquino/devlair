from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext

LABEL = "Tailscale"


def run(ctx: SetupContext) -> ModuleResult:
    if not runner.cmd_exists("tailscale"):
        console.print("\n  Installing Tailscale...")
        runner.run_shell("curl -fsSL https://tailscale.com/install.sh | sh")

    status = runner.run("tailscale status", capture=True, check=False)
    if status.returncode != 0:
        console.print("\n  [info]A login URL will appear — open it in a browser.[/info]")
        runner.run("tailscale up", check=False)

    ip = runner.get_output("tailscale ip -4")
    if ip:
        return ModuleResult(status="ok", detail=ip)
    return ModuleResult(status="warn", detail="connected but no IP yet — run 'tailscale status'")


def check() -> list[CheckItem]:
    items = []
    installed = runner.cmd_exists("tailscale")
    items.append(CheckItem(label="tailscale installed", status="ok" if installed else "fail"))
    if installed:
        ip = runner.get_output("tailscale ip -4")
        items.append(
            CheckItem(
                label="tailscale connected",
                status="ok" if ip else "warn",
                detail=ip or "not connected",
            )
        )
    return items
