from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "rclone sync"


def run(ctx: SetupContext) -> ModuleResult:
    if not runner.cmd_exists("rclone"):
        return ModuleResult(status="skip", detail="rclone not installed")
    return ModuleResult(status="skip", detail="run 'devlair sync --add' to configure a sync")


def check() -> list[CheckItem]:
    from devlair.context import resolve_invoking_user
    from devlair.features.sync import discover_timers, timer_status

    installed = runner.cmd_exists("rclone")
    items = [CheckItem(
        label="rclone",
        status="ok" if installed else "fail",
        detail="installed" if installed else "missing",
    )]

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
        items.append(CheckItem(
            label=f"rclone-{remote_name}",
            status="ok" if active == "active" else "warn",
            detail=f"timer {active} · last: {last}",
        ))

    return items
