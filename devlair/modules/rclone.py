import logging
from pathlib import Path

from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext

_log = logging.getLogger(__name__)

LABEL = "rclone sync"


def _audit(user_home: Path, **kwargs: object) -> None:
    """Best-effort audit log — never breaks the primary flow."""
    try:
        from devlair.features.audit import log_tool_install

        log_tool_install(user_home, **kwargs)  # type: ignore[arg-type]
    except Exception:
        _log.debug("audit log write failed", exc_info=True)


def run(ctx: SetupContext) -> ModuleResult:
    if not runner.cmd_exists("rclone"):
        console.print("    [muted]rclone...[/muted]")
        script = runner.safe_tempfile(suffix=".sh")
        try:
            runner.run_shell(f'curl -fsSL "https://rclone.org/install.sh" -o "{script}"', quiet=True)
            runner.run_shell(f'bash "{script}"', quiet=True)
        finally:
            script.unlink(missing_ok=True)
        _audit(ctx.user_home, tool="rclone", source="rclone.org")
    return ModuleResult(status="ok", detail="run 'devlair sync --add' to configure a sync")


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
