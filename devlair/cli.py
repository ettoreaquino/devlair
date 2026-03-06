import os
import pwd
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


def _require_root() -> str:
    """Ensure running as root and return the invoking username."""
    if os.geteuid() != 0:
        console.print("[error]Run with sudo: sudo devlair init[/error]")
        raise typer.Exit(1)
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
        with console.status(f"{prefix} ...", spinner="dots", spinner_style=D_PURPLE):
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
def doctor() -> None:
    """Check system health and verify all components."""
    from devlair.features.doctor import run_doctor

    _print_header("doctor", "Checking your lair's health")
    run_doctor()


@app.command()
def update(
    self_update: bool = typer.Option(
        False, "--self", help="Also update the devlair binary itself."
    ),
) -> None:
    """Update all installed tools."""
    from devlair.features.update import run_update

    _print_header("update", "Updating your lair")
    run_update(self_update=self_update)


@app.command(name="disable-password")
def disable_password() -> None:
    """Disable SSH password authentication (requires a public key in authorized_keys)."""
    from devlair.features.disable_password import run_disable_password

    _print_header("disable-password", "Hardening SSH authentication")
    run_disable_password()


@app.command()
def filesystem() -> None:
    """Configure your filesystem folder structure with AI guidance."""
    from devlair.features.filesystem import run_filesystem

    _print_header("filesystem", "Designing your folder structure with Claude")
    run_filesystem()


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
