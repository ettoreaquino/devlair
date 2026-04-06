from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair.features.audit import safe_log_install

LABEL = "rclone sync"


def run(ctx: SetupContext) -> ModuleResult:
    if not runner.cmd_exists("rclone"):
        console.print("    [muted]rclone...[/muted]")
        script = runner.download_script("https://rclone.org/install.sh")
        try:
            runner.run_shell(f'bash "{script}"', quiet=True)
        finally:
            script.unlink(missing_ok=True)
        safe_log_install(ctx.user_home, tool="rclone", source="rclone.org")
        return ModuleResult(status="ok", detail="installed — run 'devlair sync --add' to configure")
    return ModuleResult(status="skip", detail="already installed")


def check() -> list[CheckItem]:
    from devlair.context import resolve_invoking_user
    from devlair.features.sync import discover_timers, timer_status

    installed = runner.cmd_exists("rclone")
    items = [
        CheckItem(
            label="rclone",
            status="ok" if installed else "fail",
            detail="installed" if installed else "missing",
        )
    ]

    if not installed:
        return items

    username, user_home = resolve_invoking_user()
    timers = discover_timers(user_home)

    if not timers:
        items.append(CheckItem(label="rclone sync", status="warn", detail="no syncs configured"))
        return items

    for timer in timers:
        remote_name = timer.stem.removeprefix("rclone-")
        active, last = timer_status(username, user_home, timer.name)
        items.append(
            CheckItem(
                label=f"rclone-{remote_name}",
                status="ok" if active == "active" else "warn",
                detail=f"timer {active} · last: {last}",
            )
        )

    return items
