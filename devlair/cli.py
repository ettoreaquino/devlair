import os
import pwd
import subprocess
import sys
from pathlib import Path
from typing import Optional

import typer
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from devlair import __version__
from devlair.console import console, D_PURPLE, D_PINK, D_GREEN, D_RED, D_ORANGE, D_COMMENT
from devlair.context import ModuleResult, SetupContext

app = typer.Typer(
    name="devlair",
    help="Set up your dev lair from scratch.",
    add_completion=False,
    no_args_is_help=True,
    rich_markup_mode="rich",
)

STATUS_ICON = {
    "ok":   f"[{D_GREEN}]✓[/]",
    "warn": f"[{D_ORANGE}]⚠[/]",
    "skip": f"[{D_COMMENT}]–[/]",
    "fail": f"[{D_RED}]✗[/]",
}


def _elevate_if_needed() -> None:
    """Re-exec with sudo if not already root, with graceful error handling."""
    if os.geteuid() == 0:
        return

    console.print("[muted]Elevating to root...[/muted]")
    try:
        result = subprocess.run(["sudo"] + sys.argv)
    except FileNotFoundError:
        console.print("\n  [error]sudo is not installed.[/error]")
        console.print("  [muted]Install sudo or run this command as root.[/muted]\n")
        raise typer.Exit(1)
    except KeyboardInterrupt:
        raise typer.Exit(130)

    if result.returncode == 126:
        console.print("\n  [error]Permission denied — cannot execute the devlair interpreter.[/error]")
        console.print("  [muted]Your Python binary may have wrong permissions. Try:[/muted]")
        python_bin = sys.executable
        console.print(f"  [accent]sudo chmod 755 {python_bin}[/accent]")
        console.print(f"  [accent]sudo chown $USER:$USER {python_bin}[/accent]\n")
    elif result.returncode == 1:
        console.print("\n  [error]sudo authentication failed or was denied.[/error]\n")

    raise typer.Exit(result.returncode)


def _require_root() -> str:
    """Ensure running as root and return the invoking username."""
    _elevate_if_needed()
    username = os.environ.get("SUDO_USER", "")
    if not username or username == "root":
        username = typer.prompt("Username to configure")
    return username


def _print_header(command: str, subtitle: str) -> None:
    title = Text()
    title.append("devlair", style=f"bold {D_PURPLE}")
    title.append(f"  {command}", style=f"bold {D_PINK}")
    panel = Panel(
        f"[{D_COMMENT}]{subtitle}[/]",
        title=title,
        border_style=D_PURPLE,
        padding=(0, 2),
    )
    console.print()
    console.print(panel)
    console.print()


def _version_callback(value: bool) -> None:
    if value:
        console.print(f"devlair [accent]{__version__}[/accent]")
        raise typer.Exit()


@app.callback()
def main(
    version: Optional[bool] = typer.Option(
        None,
        "--version",
        "-v",
        callback=_version_callback,
        is_eager=True,
        help="Show version and exit.",
    ),
) -> None:
    pass


@app.command()
def init(
    only: Optional[str] = typer.Option(
        None, "--only", help="Comma-separated modules to run, e.g. system,ssh"
    ),
    skip: Optional[str] = typer.Option(
        None, "--skip", help="Comma-separated modules to skip"
    ),
) -> None:
    """Set up this machine from scratch."""
    from devlair.modules import MODULES

    username = _require_root()
    user_home = Path(pwd.getpwnam(username).pw_dir)
    ctx = SetupContext(username=username, user_home=user_home)

    _print_header("init", f"Configuring lair for [bold]{username}[/bold] on {_hostname()}")

    only_set = set(only.split(",")) if only else None
    skip_set = set(skip.split(",")) if skip else set()

    selected = [
        (key, label, mod)
        for key, label, mod in MODULES
        if (only_set is None or key in only_set) and key not in skip_set
    ]

    total = len(selected)
    results: list[tuple[str, ModuleResult]] = []

    for i, (key, label, mod) in enumerate(selected, 1):
        prefix = f"[muted]\\[{i}/{total}][/muted] [step]{label}[/step]"
        console.print(f"  ⏳ {prefix} ...")
        try:
            result = mod.run(ctx)
        except Exception as exc:
            result = ModuleResult(status="fail", detail=str(exc))
        icon = STATUS_ICON[result.status]
        detail = f"  [detail]{result.detail}[/detail]" if result.detail else ""
        console.print(f"  {icon}  {prefix}{detail}")
        results.append((label, result))

    _print_summary(results)


@app.command()
def doctor(
    fix: bool = typer.Option(False, "--fix", help="Re-apply module configs to fix detected drift."),
) -> None:
    """Check system health and verify all components."""
    from devlair.features.doctor import run_doctor

    if fix:
        _elevate_if_needed()
    _print_header("doctor", "Checking your lair's health")
    run_doctor(fix=fix)


@app.command()
def upgrade(
    skip_self: bool = typer.Option(
        False, "--no-self", help="Skip updating the devlair binary."
    ),
) -> None:
    """Upgrade all tools, re-apply configs, and verify health."""
    from devlair.features.upgrade import run_upgrade
    from devlair.modules import MODULES, REAPPLY_KEYS
    from devlair.context import resolve_invoking_user

    _elevate_if_needed()
    _print_header("upgrade", "Upgrading your lair")
    run_upgrade(self_update=not skip_self)

    # Re-apply module configurations
    username, user_home = resolve_invoking_user()
    ctx = SetupContext(username=username, user_home=user_home)

    console.print(f"  [step]Re-applying configurations...[/step]")
    for key, label, mod in MODULES:
        if key not in REAPPLY_KEYS or not hasattr(mod, "run"):
            continue
        try:
            result = mod.run(ctx)
            icon = STATUS_ICON[result.status]
            detail = f"  [detail]{result.detail}[/detail]" if result.detail else ""
            console.print(f"  {icon}  {label}{detail}")
        except Exception as exc:
            console.print(f"  {STATUS_ICON['fail']}  {label}  [detail]{exc}[/detail]")
    console.print()


@app.command(name="disable-password")
def disable_password() -> None:
    """Disable SSH password authentication (requires a public key in authorized_keys)."""
    from devlair.features.disable_password import run_disable_password

    _elevate_if_needed()
    _print_header("disable-password", "Hardening SSH authentication")
    run_disable_password()


@app.command()
def sync(
    add: bool = typer.Option(False, "--add", help="Configure a new cloud folder sync."),
    now: bool = typer.Option(False, "--now", help="Run all syncs immediately."),
    remove: bool = typer.Option(False, "--remove", help="Remove a configured sync."),
    name: str = typer.Option("", "--name", "-n", help="Sync name (for --add or --remove)."),
) -> None:
    """Manage cloud folder syncs powered by rclone."""
    from devlair.features.sync import run_sync

    if add:
        _elevate_if_needed()
    _print_header("sync", "Cloud folder sync")
    run_sync(add=add, now=now, remove=remove, name=name or None)


@app.command()
def filesystem() -> None:
    """Configure your filesystem folder structure with AI guidance."""
    from devlair.features.filesystem import run_filesystem

    _print_header("filesystem", "Designing your folder structure with Claude")
    run_filesystem()


@app.command()
def claw(
    pair: bool = typer.Option(False, "--pair", help="Pair WhatsApp via QR code."),
    allow: str = typer.Option("", "--allow", help="Add phone number to allowlist."),
    revoke: str = typer.Option("", "--revoke", help="Remove phone from allowlist."),
    logs: bool = typer.Option(False, "--logs", help="Tail agent logs."),
    stop: bool = typer.Option(False, "--stop", help="Stop the agent."),
    start: bool = typer.Option(False, "--start", help="Start the agent."),
) -> None:
    """Manage PicoCLAW AI agent with WhatsApp access."""
    from devlair.features.claw import run_claw

    _print_header("claw", "PicoCLAW Agent")
    run_claw(
        pair=pair,
        allow=allow or None,
        revoke=revoke or None,
        logs=logs,
        stop=stop,
        start=start,
    )


@app.command()
def claude(
    toggle_1m: Optional[str] = typer.Option(
        None, "--1m", metavar="on|off", help="Enable or disable 1M-token context."
    ),
    plan: Optional[str] = typer.Option(
        None, "--plan", metavar="PLAN",
        help="Set your subscription tier (pro, max5x, max20x).",
    ),
    channels: bool = typer.Option(
        False, "--channels", help="Show channel configuration status.",
    ),
) -> None:
    """View Claude Code usage dashboard."""
    from devlair.features.claude import run_claude

    run_claude(toggle_1m=toggle_1m, plan=plan, channels=channels)


# ── helpers ──────────────────────────────────────────────────────────────────

def _hostname() -> str:
    import socket
    return socket.gethostname()


def _print_summary(results: list[tuple[str, ModuleResult]]) -> None:
    ok    = sum(1 for _, r in results if r.status == "ok")
    warn  = sum(1 for _, r in results if r.status == "warn")
    fail  = sum(1 for _, r in results if r.status == "fail")
    skip  = sum(1 for _, r in results if r.status == "skip")

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(justify="right")
    table.add_column()

    if ok:   table.add_row(f"[success]{ok} ok[/success]",      "")
    if warn: table.add_row(f"[warning]{warn} warnings[/warning]", "")
    if fail: table.add_row(f"[error]{fail} failed[/error]",    "")
    if skip: table.add_row(f"[muted]{skip} skipped[/muted]",   "")

    border = D_GREEN if fail == 0 else D_RED
    console.print()
    console.print(Panel(table, title="[heading]Summary[/heading]", border_style=border, padding=(0, 2)))
    console.print()

    if fail == 0:
        console.print(f"  [success]Your lair is ready.[/success]  Restart your shell or run [accent]exec zsh[/accent]")
    else:
        console.print(f"  [error]Some modules failed.[/error] Re-run with [accent]--only[/accent] to retry individual steps.")
    console.print()


if __name__ == "__main__":
    app()
