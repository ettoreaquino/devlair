import os
import pwd
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

import typer
import typer.core
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from devlair import __version__, runner
from devlair.console import (
    D_COMMENT,
    D_CYAN,
    D_FG,
    D_GREEN,
    D_ORANGE,
    D_PINK,
    D_PURPLE,
    D_RED,
    console,
)
from devlair.context import ModuleResult, SetupContext
from devlair.modules import ModuleSpec

# ── logo ──────────────────────────────────────────────────────────────────────

_BRAND = "d e v l a i r"
_INDENT = "  "

# (inner_width, gradient_chars, show_inner_box)
# Total visible width = inner_width + 2 (border chars) + 2 (indent)
_LOGO_FULL = (48, "░░▒▒▓▓██", True)  # 52 cols, 7 rows
_LOGO_MEDIUM = (38, "░▒▓█", False)  # 42 cols, 3 rows
_LOGO_SHORT = (20, "", False)  # 24 cols, 3 rows


def _border(W: int, left: str, right: str) -> Text:
    t = Text()
    t.append(f"{_INDENT}{left}", style=D_PURPLE)
    t.append("─" * W, style=D_PURPLE)
    t.append(right, style=D_PURPLE)
    return t


def _content_row(W: int, inner: Text) -> Text:
    """Wrap inner Text inside │...│ centered to W."""
    pad = W - inner.cell_len
    pad_l = pad // 2
    pad_r = pad - pad_l
    t = Text()
    t.append(f"{_INDENT}│", style=D_PURPLE)
    t.append(" " * pad_l)
    t.append_text(inner)
    t.append(" " * pad_r)
    t.append("│", style=D_PURPLE)
    return t


def _build_logo(W: int, grad: str, inner_box: bool) -> list[Text]:
    lines: list[Text] = [_border(W, "╭", "╮")]

    if grad:
        grad_r = grad[::-1]
        gap = W - len(grad) - len(grad_r) - 4

        def _grad_row() -> Text:
            t = Text()
            t.append(f"{_INDENT}│", style=D_PURPLE)
            t.append("  ")
            t.append(grad, style=D_COMMENT)
            t.append(" " * gap)
            t.append(grad_r, style=D_COMMENT)
            t.append("  ")
            t.append("│", style=D_PURPLE)
            return t

        if inner_box:
            iw = len(_BRAND) + 4
            ib = "═" * (iw - 2)
            pt = (W - iw) // 2
            pr = W - iw - pt

            def _inner_row(content: str, style: str) -> Text:
                t = Text()
                t.append(f"{_INDENT}│", style=D_PURPLE)
                t.append(" " * pt)
                t.append(content, style=style)
                t.append(" " * pr)
                t.append("│", style=D_PURPLE)
                return t

            name_row = Text()
            name_row.append(f"{_INDENT}│", style=D_PURPLE)
            name_row.append(" " * pt)
            name_row.append("║ ", style=D_PINK)
            name_row.append(_BRAND, style=f"bold {D_FG}")
            name_row.append(" ║", style=D_PINK)
            name_row.append(" " * pr)
            name_row.append("│", style=D_PURPLE)

            lines.append(_grad_row())
            lines.append(_inner_row(f"╔{ib}╗", D_PINK))
            lines.append(name_row)
            lines.append(_inner_row(f"╚{ib}╝", D_PINK))
            lines.append(_grad_row())
        else:
            inner = Text()
            inner.append(grad, style=D_COMMENT)
            inner.append("  ")
            inner.append(_BRAND, style=f"bold {D_FG}")
            inner.append("  ")
            inner.append(grad_r, style=D_COMMENT)
            lines.append(_content_row(W, inner))
    else:
        inner = Text()
        inner.append(_BRAND, style=f"bold {D_FG}")
        lines.append(_content_row(W, inner))

    lines.append(_border(W, "╰", "╯"))
    return lines


def _render_logo() -> None:
    """Print the devlair logo, adapting to terminal width."""
    if console.color_system is None:
        console.print("[bold]devlair[/bold]")
        return

    width = shutil.get_terminal_size().columns
    for spec in (_LOGO_FULL, _LOGO_MEDIUM, _LOGO_SHORT):
        W, grad, inner_box = spec
        if width >= W + 4:
            break

    for line in _build_logo(W, grad, inner_box):
        console.print(line)


# ── custom help ───────────────────────────────────────────────────────────────

HELP_SECTIONS = [
    (
        "Setup & Health",
        [
            ("init [--only MOD] [--skip MOD] [--group GRP] [--config FILE]", "Set up this machine from scratch"),
            ("doctor [--fix]", "Check system health & fix drift"),
            ("upgrade [--no-self]", "Upgrade tools & re-apply configs"),
            ("disable-password", "Lock SSH to key-only auth"),
        ],
    ),
    (
        "Cloud & Filesystem",
        [
            ("sync [--add|--remove|--now]", "Manage rclone folder syncs"),
            ("filesystem", "AI-guided folder structure design"),
        ],
    ),
    (
        "AI Agents & Channels",
        [
            ("claude [--plan TIER] [--1m on|off]", "Usage dashboard & config"),
            ("claw [--pair|--start|--stop]", "PicoCLAW WhatsApp agent"),
        ],
    ),
    (
        "tmux Sessions",  # shell aliases & keybindings, not Typer commands
        [
            ("t", "Start/attach default 'dev' session"),
            ("tmx <name>", "Attach to a named session"),
            ("tmx new --name N", "Create a plain session"),
            ("tmx new --name N --claude", "Session with Claude Code"),
            ("tmx new --name N --claude-telegram", "Create Telegram channel"),
            ("Ctrl+A  y", "Claude Code popup (any session)"),
        ],
    ),
]


def _render_help() -> None:
    console.print()
    _render_logo()
    console.print(f"  [{D_COMMENT}]v{__version__}[/]")

    cmd_w = max(len(cmd) for _, entries in HELP_SECTIONS for cmd, _ in entries)

    for section_title, entries in HELP_SECTIONS:
        console.print()
        console.print(f"  [{D_PINK}]{section_title}[/]")
        for cmd, desc in entries:
            console.print(f"    [{D_PURPLE}]{cmd:<{cmd_w}}[/]  [{D_COMMENT}]{desc}[/]")

    console.print()
    console.print(
        f"  [{D_COMMENT}]Options:  "
        f"[{D_CYAN}]--version[/] [{D_COMMENT}]-v[/]  "
        f"[{D_COMMENT}]Show version    "
        f"[{D_CYAN}]--help[/]  [{D_COMMENT}]Show this screen[/]"
    )
    console.print()


class DevlairGroup(typer.core.TyperGroup):
    """Override the default Typer help to show grouped panels."""

    def format_help(self, ctx: typer.Context, formatter: typer.core.click.HelpFormatter) -> None:
        _render_help()


app = typer.Typer(
    name="devlair",
    cls=DevlairGroup,
    help="Set up your dev lair from scratch.",
    add_completion=False,
    no_args_is_help=True,
    rich_markup_mode="rich",
)

STATUS_ICON = {
    "ok": f"[{D_GREEN}]✓[/]",
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
    only: Optional[str] = typer.Option(None, "--only", help="Comma-separated modules to run, e.g. system,ssh"),
    skip: Optional[str] = typer.Option(None, "--skip", help="Comma-separated modules to skip"),
    group: Optional[str] = typer.Option(
        None, "--group", help="Comma-separated groups: core, network, coding, cloud-sync, ai, desktop"
    ),
    config: Optional[Path] = typer.Option(None, "--config", help="Path to a setup.yaml profile"),
) -> None:
    """Set up this machine from scratch."""
    from devlair.context import detect_platform, detect_wsl_version
    from devlair.modules import keys_for_groups, resolve_order

    username = _require_root()
    user_home = Path(pwd.getpwnam(username).pw_dir)
    platform = detect_platform()

    # Load profile if provided
    profile_data: dict = {}
    profile_name: str | None = None
    if config:
        from devlair.features.profile import ProfileError, load_profile, resolve_profile_keys, validate_profile

        try:
            profile_data = validate_profile(load_profile(config))
        except ProfileError as exc:
            console.print(f"  [error]Profile error: {exc}[/error]")
            raise typer.Exit(1)
        profile_name = profile_data.get("name")

    ctx = SetupContext(
        username=username,
        user_home=user_home,
        platform=platform,
        wsl_version=detect_wsl_version(platform),
        profile=profile_data.get("config", {}),
    )

    suffix = {"wsl": " (WSL)", "macos": " (macOS)"}.get(platform, "")
    profile_suffix = f"  profile: [bold]{profile_name}[/bold]" if profile_name else ""
    _print_header("init", f"Configuring lair for [bold]{username}[/bold] on {_hostname()}{suffix}{profile_suffix}")

    # Build the set of requested keys — CLI flags override profile
    want: set[str] | None = None
    skip_set: set[str] = set()

    if only or group:
        # CLI flags take precedence
        if group:
            want = keys_for_groups(set(group.split(",")))
        if only:
            only_set = set(only.split(","))
            want = only_set if want is None else want & only_set
    elif profile_data:
        want, skip_set = resolve_profile_keys(profile_data)

    # CLI --skip is always additive
    if skip:
        skip_set = skip_set | set(skip.split(","))

    all_specs = resolve_order(want)
    platform_skipped = [s for s in all_specs if platform not in s.platforms]
    selected = [s for s in all_specs if platform in s.platforms and s.key not in skip_set]

    # When no explicit selection, filter out modules not default for this platform
    optional_specs: list[ModuleSpec] = []
    if want is None:
        optional_specs = [s for s in selected if s.default_on is not None and platform not in s.default_on]
        optional_keys = {s.key for s in optional_specs}
        selected = [s for s in selected if s.key not in optional_keys]

    if platform_skipped:
        names = ", ".join(s.key for s in platform_skipped)
        console.print(f"  [{D_COMMENT}]Skipping on {platform}: {names}[/]")
        console.print()

    # Docker pre-flight on WSL — only if a selected module needs it
    docker_needed = any(s.key in ("devtools", "claw") for s in selected)
    if platform == "wsl" and docker_needed and not runner.cmd_exists("docker"):
        console.print("  [error]Docker not found.[/error]")
        console.print("  On WSL, Docker must be provided by Docker Desktop for Windows.")
        console.print(
            "  Install it from: [accent]https://docs.docker.com/desktop/setup/install/windows-install/[/accent]"
        )
        console.print("  Then enable WSL integration in Docker Desktop → Settings → Resources → WSL Integration.")
        console.print()
        raise typer.Exit(1)

    total = len(selected)
    results: list[tuple[str, ModuleResult]] = []

    from devlair.features.audit import log_module_result

    for i, s in enumerate(selected, 1):
        prefix = f"[muted]\\[{i}/{total}][/muted] [step]{s.label}[/step]"
        console.print(f"  ⏳ {prefix} ...")
        try:
            result = s.module.run(ctx)
        except Exception as exc:
            result = ModuleResult(status="fail", detail=str(exc))
        icon = STATUS_ICON[result.status]
        detail = f"  [detail]{result.detail}[/detail]" if result.detail else ""
        console.print(f"  {icon}  {prefix}{detail}")
        results.append((s.label, result))
        try:
            log_module_result(ctx.user_home, module=s.key, status=result.status, detail=result.detail)
        except Exception:
            pass  # audit logging must never break init

    _print_summary(results)
    if optional_specs:
        _print_optional(optional_specs)


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
    skip_self: bool = typer.Option(False, "--no-self", help="Skip updating the devlair binary."),
) -> None:
    """Upgrade all tools, re-apply configs, and verify health."""
    from devlair.context import detect_platform, detect_wsl_version, resolve_invoking_user
    from devlair.features.upgrade import run_upgrade
    from devlair.modules import REAPPLY_KEYS, resolve_order

    _elevate_if_needed()
    _print_header("upgrade", "Upgrading your lair")
    run_upgrade(self_update=not skip_self)

    # Re-apply module configurations in dependency order
    username, user_home = resolve_invoking_user()
    platform = detect_platform()
    ctx = SetupContext(
        username=username, user_home=user_home, platform=platform, wsl_version=detect_wsl_version(platform)
    )

    console.print("  [step]Re-applying configurations...[/step]")
    for s in resolve_order(REAPPLY_KEYS, platform=platform):
        if not hasattr(s.module, "run"):
            continue
        # Skip opt-in modules unless they were actually installed
        if s.default_on is not None and platform not in s.default_on:
            if hasattr(s.module, "check") and all(c.status != "ok" for c in s.module.check()):
                continue
        try:
            result = s.module.run(ctx)
            icon = STATUS_ICON[result.status]
            detail = f"  [detail]{result.detail}[/detail]" if result.detail else ""
            console.print(f"  {icon}  {s.label}{detail}")
        except Exception as exc:
            console.print(f"  {STATUS_ICON['fail']}  {s.label}  [detail]{exc}[/detail]")
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
    toggle_1m: Optional[str] = typer.Option(None, "--1m", metavar="on|off", help="Enable or disable 1M-token context."),
    plan: Optional[str] = typer.Option(
        None,
        "--plan",
        metavar="PLAN",
        help="Set your subscription tier (pro, max5x, max20x).",
    ),
    channels: bool = typer.Option(
        False,
        "--channels",
        help="Show channel configuration status.",
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
    ok = sum(1 for _, r in results if r.status == "ok")
    warn = sum(1 for _, r in results if r.status == "warn")
    fail = sum(1 for _, r in results if r.status == "fail")
    skip = sum(1 for _, r in results if r.status == "skip")

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(justify="right")
    table.add_column()

    if ok:
        table.add_row(f"[success]{ok} ok[/success]", "")
    if warn:
        table.add_row(f"[warning]{warn} warnings[/warning]", "")
    if fail:
        table.add_row(f"[error]{fail} failed[/error]", "")
    if skip:
        table.add_row(f"[muted]{skip} skipped[/muted]", "")

    border = D_GREEN if fail == 0 else D_RED
    console.print()
    console.print(Panel(table, title="[heading]Summary[/heading]", border_style=border, padding=(0, 2)))
    console.print()

    if fail == 0:
        console.print("  [success]Your lair is ready.[/success]  Restart your shell or run [accent]exec zsh[/accent]")
    else:
        console.print(
            "  [error]Some modules failed.[/error] Re-run with [accent]--only[/accent] to retry individual steps."
        )
    console.print()


def _print_optional(specs: list[ModuleSpec]) -> None:
    console.print("  [info]Optional add-ins:[/info]")
    for s in specs:
        console.print(f"    [accent]devlair init --only {s.key:<12}[/accent]  {s.label}")
    console.print()


if __name__ == "__main__":
    app()
