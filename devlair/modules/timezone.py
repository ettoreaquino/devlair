import typer

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner
from devlair.console import console

LABEL = "Timezone"
DEFAULT_TZ = "UTC"


def run(ctx: SetupContext) -> ModuleResult:
    current = runner.get_output("timedatectl show --property=Timezone --value")
    console.print(f"\n  Current timezone: [detail]{current or 'unknown'}[/detail]")
    tz = typer.prompt("  Set timezone", default=current or DEFAULT_TZ)
    runner.run(["timedatectl", "set-timezone", tz])
    return ModuleResult(status="ok", detail=tz)


def check() -> list[CheckItem]:
    tz = runner.get_output("timedatectl show --property=Timezone --value")
    return [CheckItem(label="timezone", status="ok", detail=tz or "unknown")]
