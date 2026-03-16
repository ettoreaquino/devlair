import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import typer
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from devlair.console import (
    console,
    D_PURPLE, D_PINK, D_GREEN, D_ORANGE, D_YELLOW,
    D_CYAN, D_COMMENT, D_FG, D_RED,
)

ACTIVE_FILE = Path("~/.claude/devlair-active")
SESSIONS_FILE = Path("~/.claude/devlair-sessions.jsonl")
SETTINGS_FILE = Path("~/.claude/settings.json")


def _bar(used: int, total: Optional[int], width: int = 20) -> str:
    if not total:
        pct, color = 0.5, D_PURPLE
    else:
        pct = min(used / total, 1.0)
        color = D_RED if pct > 0.9 else D_ORANGE if pct > 0.7 else D_GREEN
    filled = int(width * pct)
    return f"[{color}]{'█' * filled}[/][{D_COMMENT}]{'░' * (width - filled)}[/]"


def _rel_time(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    diff = int((now - dt).total_seconds())
    if diff < 60:
        return f"{diff}s ago"
    if diff < 3600:
        return f"{diff // 60}m ago"
    return f"{diff // 3600}h ago"


def _fmt_time(dt: datetime) -> str:
    local = dt.astimezone()
    return f"{local.strftime('%H:%M')}  ({_rel_time(dt)})"


def _last_session_panel() -> Panel:
    active = ACTIVE_FILE.expanduser()
    sessions = SESSIONS_FILE.expanduser()

    model = project = ended_fmt = "–"
    in_tok = out_tok = 0
    cost = 0.0
    is_active = False

    if active.exists():
        try:
            data = json.loads(active.read_text())
            model = data.get("model", "–")
            project = data.get("cwd", "–")
            ended_fmt = f"[{D_CYAN}]active now[/]"
            is_active = True
        except (json.JSONDecodeError, OSError):
            pass

    if not is_active and sessions.exists():
        try:
            last_line = sessions.read_text().strip().splitlines()[-1]
            data = json.loads(last_line)
            project = data.get("cwd", "–")
            ended_at_str = data.get("ended_at", "")
            if ended_at_str:
                ended_dt = datetime.fromisoformat(ended_at_str.replace("Z", "+00:00"))
                ended_fmt = _fmt_time(ended_dt)
            model = "–"
        except (json.JSONDecodeError, OSError, IndexError, ValueError):
            pass

    # Shorten home dir to ~
    if project.startswith(str(Path.home())):
        project = "~" + project[len(str(Path.home())):]

    title = Text()
    title.append("devlair", style=f"bold {D_PURPLE}")
    title.append("  claude", style=f"bold {D_PINK}")

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style=D_COMMENT, width=12, justify="right")
    table.add_column()

    table.add_row("Model",   f"[{D_PINK}]{model}[/]")
    table.add_row("Project", f"[{D_CYAN}]{project}[/]")
    table.add_row("Ended",   ended_fmt if is_active else f"[{D_FG}]{ended_fmt}[/]")
    table.add_row("Tokens",  f"[{D_GREEN}]{in_tok:,}[/] in  /  [{D_ORANGE}]{out_tok:,}[/] out")
    table.add_row("Cost",    f"[{D_YELLOW}]~${cost:.2f}[/]")

    return Panel(table, title=title, border_style=D_PURPLE, padding=(0, 2))


def _this_week_panel() -> Panel:
    sessions = SESSIONS_FILE.expanduser()

    from collections import defaultdict
    now = datetime.now(timezone.utc)
    cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # 7 days ago
    from datetime import timedelta
    week_cutoff = cutoff - timedelta(days=7)

    total_sessions = 0
    model_counts: dict[str, int] = defaultdict(int)

    if sessions.exists():
        for line in sessions.read_text().strip().splitlines():
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                ended_at_str = data.get("ended_at", "")
                if not ended_at_str:
                    continue
                ended_dt = datetime.fromisoformat(ended_at_str.replace("Z", "+00:00"))
                if ended_dt >= week_cutoff:
                    total_sessions += 1
            except (json.JSONDecodeError, ValueError):
                continue

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style=D_COMMENT, width=10, justify="right")
    table.add_column(width=22, no_wrap=True)
    table.add_column(style=D_FG, min_width=14)

    table.add_row("Sessions", "", f"[{D_FG}]{total_sessions}[/]")
    table.add_row("", "", "")
    table.add_row(
        "All",
        _bar(total_sessions, None),
        f"[{D_COMMENT}]– (phase 2)[/]",
    )

    return Panel(
        table,
        title=f"[bold {D_COMMENT}]This Week[/]",
        border_style=D_COMMENT,
        padding=(0, 2),
    )


def run_claude(toggle_1m: Optional[str] = None) -> None:
    if toggle_1m is not None:
        _toggle_1m(toggle_1m)
        return

    console.print()
    console.print(_last_session_panel())
    console.print()
    console.print(_this_week_panel())
    console.print()


def _toggle_1m(value: str) -> None:
    settings = SETTINGS_FILE.expanduser()
    data: dict = {}
    if settings.exists():
        try:
            data = json.loads(settings.read_text()) or {}
        except (json.JSONDecodeError, OSError):
            data = {}

    if value == "on":
        data["model"] = "opus[1m]"
        settings.write_text(json.dumps(data, indent=2) + "\n")
        console.print(f"  [{D_GREEN}]✓[/]  1M context enabled — model set to [bold]opus[1m][/bold]")
        console.print(f"  [{D_COMMENT}]Revert with:[/] devlair claude --1m off")
    elif value == "off":
        data["model"] = "sonnet"
        settings.write_text(json.dumps(data, indent=2) + "\n")
        console.print(f"  [{D_GREEN}]✓[/]  1M context disabled — model reset to [bold]sonnet[/bold]")
    else:
        console.print(f"  [{D_RED}]✗[/]  Unknown value '{value}' — use [bold]on[/bold] or [bold]off[/bold]")
        raise typer.Exit(1)
