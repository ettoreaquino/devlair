from rich.table import Table

from devlair.console import D_COMMENT, D_GREEN, D_ORANGE, D_RED, console
from devlair.context import CheckItem, detect_platform
from devlair.modules import MODULE_SPECS

STATUS_STYLE = {
    "ok": f"bold {D_GREEN}",
    "warn": f"bold {D_ORANGE}",
    "fail": f"bold {D_RED}",
}
STATUS_ICON = {"ok": "✓", "warn": "⚠", "fail": "✗"}


def run_doctor(fix: bool = False) -> None:
    table = Table(show_header=True, header_style=f"bold {D_COMMENT}", box=None, padding=(0, 2))
    table.add_column("Module")
    table.add_column("Check")
    table.add_column("Status", justify="center")
    table.add_column("Detail")

    total = ok = warn = fail = 0
    failed_keys: set[str] = set()
    platform = detect_platform()

    for s in MODULE_SPECS:
        if platform not in s.platforms:
            continue
        if not hasattr(s.module, "check"):
            continue
        items: list[CheckItem] = s.module.check()
        first = True
        for item in items:
            total += 1
            if item.status == "ok":
                ok += 1
            elif item.status == "warn":
                warn += 1
            else:
                fail += 1

            if item.status in ("warn", "fail"):
                failed_keys.add(s.key)

            style = STATUS_STYLE[item.status]
            icon = STATUS_ICON[item.status]
            table.add_row(
                s.label if first else "",
                item.label,
                f"[{style}]{icon}[/]",
                f"[{D_COMMENT}]{item.detail}[/]" if item.detail else "",
            )
            first = False

    console.print(table)
    console.print()

    if fail == 0 and warn == 0:
        console.print(f"  [success]All {total} checks passed.[/success]")
    else:
        if fail:
            console.print(f"  [error]{fail} checks failed.[/error]")
        if warn:
            console.print(f"  [warning]{warn} warnings.[/warning]")

    if fix and failed_keys:
        from devlair.context import SetupContext, detect_wsl_version, resolve_invoking_user
        from devlair.modules import REAPPLY_KEYS, resolve_order

        username, user_home = resolve_invoking_user()
        ctx = SetupContext(username=username, user_home=user_home, platform=platform, wsl_version=detect_wsl_version())

        console.print()
        console.print(f"  [step]Attempting to fix {len(failed_keys)} module(s)...[/step]")
        console.print()

        for s in resolve_order(failed_keys, platform=platform):
            if s.key not in REAPPLY_KEYS:
                console.print(f"  [{D_COMMENT}]–  {s.label} (manual fix required)[/]")
                continue
            if not hasattr(s.module, "run"):
                continue
            try:
                s.module.run(ctx)
                console.print(f"  [success]✓[/success]  {s.label} re-applied")
            except Exception as exc:
                console.print(f"  [error]✗[/error]  {s.label}: {exc}")

    console.print()
