import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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

PROJECTS_DIR = Path("~/.claude/projects")
SETTINGS_FILE = Path("~/.claude/settings.json")
DEVLAIR_CONFIG = Path("~/.claude/devlair-config.json")

# Cost per token (USD) — Anthropic pricing as of 2025-08
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-opus-4-6":          {"input": 15.0 / 1e6, "output": 75.0 / 1e6, "cache_write": 18.75 / 1e6, "cache_read": 1.50 / 1e6},
    "claude-sonnet-4-6":        {"input":  3.0 / 1e6, "output": 15.0 / 1e6, "cache_write":  3.75 / 1e6, "cache_read": 0.30 / 1e6},
    "claude-haiku-4-5-20251001":{"input":  0.8 / 1e6, "output":  4.0 / 1e6, "cache_write":  1.00 / 1e6, "cache_read": 0.08 / 1e6},
}
DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-6"]

# Estimated budgets per plan tier (community-observed approximations).
# 5h window: output tokens per 5-hour rolling window.
# Weekly: approximate API-rate cost equivalent per 7-day period.
PLAN_BUDGETS: dict[str, dict[str, float]] = {
    "pro":    {"5h_output_tokens": 44_000,  "weekly_cost": 80.0},
    "max5x":  {"5h_output_tokens": 88_000,  "weekly_cost": 400.0},
    "max20x": {"5h_output_tokens": 220_000, "weekly_cost": 1600.0},
}
DEFAULT_PLAN = "max5x"
VALID_PLANS = list(PLAN_BUDGETS.keys())


@dataclass
class SessionUsage:
    """Aggregated token/cost data from a single transcript."""
    session_id: str = ""
    model: str = ""
    started_at: Optional[datetime] = None
    input_tokens: int = 0
    output_tokens: int = 0
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0
    cost: float = 0.0


def _get_plan() -> str:
    """Read plan from ~/.devlair/config.json, default to max5x."""
    config = DEVLAIR_CONFIG.expanduser()
    if config.exists():
        try:
            data = json.loads(config.read_text())
            plan = data.get("claude_plan", DEFAULT_PLAN)
            if plan in PLAN_BUDGETS:
                return plan
        except (json.JSONDecodeError, OSError):
            pass
    return DEFAULT_PLAN


def _set_plan(plan: str) -> None:
    """Write plan to ~/.devlair/config.json."""
    config = DEVLAIR_CONFIG.expanduser()
    config.parent.mkdir(parents=True, exist_ok=True)

    data: dict = {}
    if config.exists():
        try:
            data = json.loads(config.read_text()) or {}
        except (json.JSONDecodeError, OSError):
            data = {}

    data["claude_plan"] = plan
    config.write_text(json.dumps(data, indent=2) + "\n")


def _parse_transcript(path: Path) -> Optional[SessionUsage]:
    """Parse a transcript JSONL and return aggregated usage."""
    if not path.exists():
        return None

    usage = SessionUsage(session_id=path.stem)
    pricing = DEFAULT_PRICING

    try:
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            data = json.loads(line)

            if usage.started_at is None:
                ts = data.get("timestamp")
                if ts:
                    usage.started_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))

            msg = data.get("message", {})
            if not isinstance(msg, dict):
                continue

            if not usage.model and msg.get("role") == "assistant":
                m = msg.get("model", "")
                if m and m != "<synthetic>":
                    usage.model = m
                    pricing = MODEL_PRICING.get(m, DEFAULT_PRICING)

            u = msg.get("usage")
            if not u:
                continue

            usage.input_tokens += u.get("input_tokens", 0)
            usage.output_tokens += u.get("output_tokens", 0)
            usage.cache_write_tokens += u.get("cache_creation_input_tokens", 0)
            usage.cache_read_tokens += u.get("cache_read_input_tokens", 0)

    except (json.JSONDecodeError, OSError):
        return None

    usage.cost = (
        usage.input_tokens * pricing["input"]
        + usage.output_tokens * pricing["output"]
        + usage.cache_write_tokens * pricing["cache_write"]
        + usage.cache_read_tokens * pricing["cache_read"]
    )

    return usage


def _all_transcripts() -> list[Path]:
    """Return all transcript JSONL files across all projects."""
    root = PROJECTS_DIR.expanduser()
    if not root.exists():
        return []
    return sorted(root.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)


def _fmt_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


def _bar(pct: float, width: int = 20) -> str:
    pct = max(0.0, min(pct, 1.0))
    color = D_RED if pct > 0.9 else D_ORANGE if pct > 0.7 else D_GREEN
    filled = int(width * pct)
    return f"[{color}]{'█' * filled}[/][{D_COMMENT}]{'░' * (width - filled)}[/]"


def _fmt_remaining(seconds: int) -> str:
    if seconds <= 0:
        return "now"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    if h > 0:
        return f"~{h}h{m:02d}m"
    return f"~{m}m"


def _aggregate(transcripts: list[Path], cutoff: datetime) -> tuple[int, int, int, float]:
    """Aggregate usage from transcripts after cutoff. Returns (sessions, in_tokens, out_tokens, cost)."""
    sessions = 0
    total_in = total_out = 0
    total_cost = 0.0

    for path in transcripts:
        usage = _parse_transcript(path)
        if not usage or not usage.started_at:
            continue
        if usage.started_at < cutoff:
            continue
        sessions += 1
        total_in += usage.input_tokens + usage.cache_write_tokens + usage.cache_read_tokens
        total_out += usage.output_tokens
        total_cost += usage.cost

    return sessions, total_in, total_out, total_cost


def _find_window_start(transcripts: list[Path], window: timedelta) -> Optional[datetime]:
    """Find when the first session in the current window started (for reset countdown)."""
    now = datetime.now(timezone.utc)
    cutoff = now - window
    earliest = None

    for path in transcripts:
        usage = _parse_transcript(path)
        if not usage or not usage.started_at:
            continue
        if usage.started_at < cutoff:
            continue
        if earliest is None or usage.started_at < earliest:
            earliest = usage.started_at

    return earliest


def _dashboard_panel() -> Panel:
    plan = _get_plan()
    budget = PLAN_BUDGETS[plan]
    now = datetime.now(timezone.utc)

    transcripts = _all_transcripts()

    # ── 5h rolling window ────────────────────────────────────────────────
    window_5h = timedelta(hours=5)
    cutoff_5h = now - window_5h
    sess_5h, in_5h, out_5h, cost_5h = _aggregate(transcripts, cutoff_5h)
    pct_5h = min(out_5h / budget["5h_output_tokens"], 1.0) if budget["5h_output_tokens"] else 0

    # Reset countdown: 5h after the earliest session in this window
    window_start = _find_window_start(transcripts, window_5h)
    if window_start:
        reset_at = window_start + window_5h
        remaining = int((reset_at - now).total_seconds())
        reset_str = f"resets in {_fmt_remaining(remaining)}" if remaining > 0 else "resetting"
    else:
        reset_str = "no activity"

    # ── This week ────────────────────────────────────────────────────────
    cutoff_week = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=7)
    sess_wk, in_wk, out_wk, cost_wk = _aggregate(transcripts, cutoff_week)
    pct_wk = min(cost_wk / budget["weekly_cost"], 1.0) if budget["weekly_cost"] else 0

    # ── Build table ──────────────────────────────────────────────────────
    table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
    table.add_column(style=D_COMMENT, width=11, justify="right")  # label
    table.add_column(width=22, no_wrap=True)                       # bar
    table.add_column(width=5, justify="right", no_wrap=True)       # pct
    table.add_column(no_wrap=True)                                 # detail

    def _detail(cost: float, in_t: int, out_t: int) -> str:
        cost_str = f"${cost:.0f}" if cost >= 100 else f"${cost:.2f}"
        return f" [{D_YELLOW}]~{cost_str}[/]  [{D_GREEN}]{_fmt_tokens(in_t)}[/] [{D_COMMENT}]in[/] [{D_ORANGE}]{_fmt_tokens(out_t)}[/] [{D_COMMENT}]out[/]"

    table.add_row("5h window", _bar(pct_5h), f"[bold]{pct_5h * 100:.0f}%[/]", _detail(cost_5h, in_5h, out_5h))
    table.add_row("", "", "", f" [{D_COMMENT}]{reset_str}[/]")
    table.add_row("", "", "", "")
    table.add_row("This Week", _bar(pct_wk), f"[bold]{pct_wk * 100:.0f}%[/]", _detail(cost_wk, in_wk, out_wk))
    table.add_row("", "", "", f" [{D_COMMENT}]{sess_wk} sessions[/]")

    title = Text()
    title.append("devlair", style=f"bold {D_PURPLE}")
    title.append("  claude", style=f"bold {D_PINK}")
    title.append(f"  {plan}", style=f"bold {D_COMMENT}")

    return Panel(table, title=title, border_style=D_PURPLE, padding=(0, 2))


def run_claude(
    toggle_1m: Optional[str] = None,
    plan: Optional[str] = None,
) -> None:
    if plan is not None:
        if plan not in VALID_PLANS:
            console.print(f"  [{D_RED}]Unknown plan '{plan}'[/] — use one of: {', '.join(VALID_PLANS)}")
            raise typer.Exit(1)
        _set_plan(plan)
        console.print(f"  [{D_GREEN}]✓[/]  Plan set to [bold]{plan}[/bold]")
        return

    if toggle_1m is not None:
        _toggle_1m(toggle_1m)
        return

    console.print()
    console.print(_dashboard_panel())
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
