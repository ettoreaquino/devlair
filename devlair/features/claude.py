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
    D_COMMENT, D_FG, D_RED,
)
from devlair.context import read_json, update_json

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

# Estimated budgets per plan tier (reverse-engineered from web dashboard, 2026-03).
# Anthropic does not publish exact limits; these are calibrated from a max5x
# data point (49K out ≈ 8% of 5h, $155 ≈ 3% of weekly) and the official
# 1x / 5x / 20x multipliers.  Expect ±20% variance.
# 5h window: output tokens per 5-hour rolling window.
# Weekly: approximate API-rate cost equivalent per 7-day period.
PLAN_BUDGETS: dict[str, dict[str, float]] = {
    "pro":    {"5h_output_tokens": 125_000,  "weekly_cost": 1_000.0},
    "max5x":  {"5h_output_tokens": 625_000,  "weekly_cost": 5_000.0},
    "max20x": {"5h_output_tokens": 2_500_000, "weekly_cost": 20_000.0},
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
    """Read plan from config, default to max5x."""
    plan = read_json(DEVLAIR_CONFIG.expanduser()).get("claude_plan", DEFAULT_PLAN)
    return plan if plan in PLAN_BUDGETS else DEFAULT_PLAN


def _set_plan(plan: str) -> None:
    """Write plan to config."""
    update_json(DEVLAIR_CONFIG.expanduser(), {"claude_plan": plan})


def _parse_transcript(path: Path) -> Optional[SessionUsage]:
    """Parse a transcript JSONL and return aggregated usage."""
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


def _parse_all(cutoff: datetime) -> list[SessionUsage]:
    """Parse all transcripts newer than cutoff (sorted newest-first, stops early)."""
    root = PROJECTS_DIR.expanduser()
    if not root.exists():
        return []

    paths = sorted(root.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    results: list[SessionUsage] = []

    for path in paths:
        usage = _parse_transcript(path)
        if not usage or not usage.started_at:
            continue
        if usage.started_at < cutoff:
            break  # sorted newest-first, all remaining are older
        results.append(usage)

    return results


@dataclass
class _WindowStats:
    sessions: int = 0
    in_tokens: int = 0
    out_tokens: int = 0
    cost: float = 0.0
    earliest: Optional[datetime] = None


def _aggregate(parsed: list[SessionUsage], cutoff: datetime) -> _WindowStats:
    """Aggregate pre-parsed sessions after cutoff."""
    stats = _WindowStats()
    for u in parsed:
        if not u.started_at or u.started_at < cutoff:
            continue
        stats.sessions += 1
        stats.in_tokens += u.input_tokens + u.cache_write_tokens + u.cache_read_tokens
        stats.out_tokens += u.output_tokens
        stats.cost += u.cost
        if stats.earliest is None or u.started_at < stats.earliest:
            stats.earliest = u.started_at
    return stats


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


def _dashboard_panel() -> Panel:
    plan = _get_plan()
    budget = PLAN_BUDGETS[plan]
    now = datetime.now(timezone.utc)

    # Parse all transcripts once (stops at weekly cutoff)
    cutoff_week = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=7)
    parsed = _parse_all(cutoff_week)

    # ── 5h rolling window ────────────────────────────────────────────────
    cutoff_5h = now - timedelta(hours=5)
    w5h = _aggregate(parsed, cutoff_5h)
    pct_5h = min(w5h.out_tokens / budget["5h_output_tokens"], 1.0) if budget["5h_output_tokens"] else 0

    if w5h.earliest:
        remaining = int((w5h.earliest + timedelta(hours=5) - now).total_seconds())
        reset_str = f"resets in {_fmt_remaining(remaining)}" if remaining > 0 else "resetting"
    else:
        reset_str = "no activity"

    # ── This week ────────────────────────────────────────────────────────
    wk = _aggregate(parsed, cutoff_week)
    pct_wk = min(wk.cost / budget["weekly_cost"], 1.0) if budget["weekly_cost"] else 0

    # ── Build table ──────────────────────────────────────────────────────
    table = Table(show_header=False, box=None, padding=(0, 1), expand=True)
    table.add_column(style=D_COMMENT, width=11, justify="right")
    table.add_column(width=22, no_wrap=True)
    table.add_column(width=5, justify="right", no_wrap=True)
    table.add_column(no_wrap=True)

    def _detail(cost: float, in_t: int, out_t: int) -> str:
        cost_str = f"${cost:.0f}" if cost >= 100 else f"${cost:.2f}"
        return f" [{D_YELLOW}]~{cost_str}[/]  [{D_GREEN}]{_fmt_tokens(in_t)}[/] [{D_COMMENT}]in[/] [{D_ORANGE}]{_fmt_tokens(out_t)}[/] [{D_COMMENT}]out[/]"

    table.add_row("5h window", _bar(pct_5h), f"[bold]{pct_5h * 100:.0f}%[/]", _detail(w5h.cost, w5h.in_tokens, w5h.out_tokens))
    table.add_row("", "", "", f" [{D_COMMENT}]{reset_str}[/]")
    table.add_row("", "", "", "")
    table.add_row("This Week", _bar(pct_wk), f"[bold]{pct_wk * 100:.0f}%[/]", _detail(wk.cost, wk.in_tokens, wk.out_tokens))
    table.add_row("", "", "", f" [{D_COMMENT}]{wk.sessions} sessions[/]")

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

    if value == "on":
        update_json(settings, {"model": "opus[1m]"})
        console.print(f"  [{D_GREEN}]✓[/]  1M context enabled — model set to [bold]opus[1m][/bold]")
        console.print(f"  [{D_COMMENT}]Revert with:[/] devlair claude --1m off")
    elif value == "off":
        update_json(settings, {"model": "sonnet"})
        console.print(f"  [{D_GREEN}]✓[/]  1M context disabled — model reset to [bold]sonnet[/bold]")
    else:
        console.print(f"  [{D_RED}]✗[/]  Unknown value '{value}' — use [bold]on[/bold] or [bold]off[/bold]")
        raise typer.Exit(1)
