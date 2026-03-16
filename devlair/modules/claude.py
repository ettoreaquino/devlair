import json
import shutil
import stat
from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "Claude Code"

SETTINGS_PATH = Path("~/.claude/settings.json")

DEVLAIR_MANAGED_KEYS = {"model", "effortLevel", "hooks"}

DEVLAIR_SETTINGS = {
    "model": "sonnet",
    "effortLevel": "medium",
    "hooks": {
        "SessionStart": [{
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": (
                    "jq -c '{pid:(env.PPID|tonumber? // 0),session_id,model,cwd,"
                    "started_at:(now|todate)}' > ~/.claude/devlair-active; "
                    "tmux refresh-client -S 2>/dev/null; true"
                ),
            }],
        }],
        "Stop": [{
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": (
                    "jq -c '{session_id,transcript_path,cwd,ended_at:(now|todate)}'"
                    " >> ~/.claude/devlair-sessions.jsonl; "
                    "rm -f ~/.claude/devlair-active; "
                    "tmux refresh-client -S 2>/dev/null; true"
                ),
            }],
        }],
    },
}

CLAUDE_STATUS_SH = """\
#!/bin/bash
ACTIVE="$HOME/.claude/devlair-active"
SESSIONS="$HOME/.claude/devlair-sessions.jsonl"

if [ -f "$ACTIVE" ]; then
  PID=$(jq -r '.pid // 0' "$ACTIVE" 2>/dev/null)
  if [ "$PID" -gt 0 ] && kill -0 "$PID" 2>/dev/null; then
    MODEL=$(jq -r '.model // ""' "$ACTIVE" 2>/dev/null \\
      | sed 's/claude-//' | sed 's/-.*//' | cut -c1-6)
    echo "CC:${MODEL}"
    exit 0
  fi
  rm -f "$ACTIVE"
fi

if [ -f "$SESSIONS" ]; then
  TODAY=$(date +%Y-%m-%d)
  COUNT=$(grep -c "$TODAY" "$SESSIONS" 2>/dev/null || echo 0)
  [ "$COUNT" -gt 0 ] && echo "${COUNT}s"
fi
"""


def _merge_settings(path: Path) -> None:
    """Merge devlair-owned keys into settings.json, preserving all other user keys."""
    existing: dict = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text()) or {}
        except (json.JSONDecodeError, OSError):
            existing = {}

    existing.update(DEVLAIR_SETTINGS)
    path.write_text(json.dumps(existing, indent=2) + "\n")


def _install_status_script(bin_dir: Path, username: str) -> None:
    bin_dir.mkdir(parents=True, exist_ok=True)
    script = bin_dir / "claude-status.sh"
    script.write_text(CLAUDE_STATUS_SH)
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    shutil.chown(script, username, username)
    shutil.chown(bin_dir, username, username)


def run(ctx: SetupContext) -> ModuleResult:
    claude_dir = ctx.user_home / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    shutil.chown(claude_dir, ctx.username, ctx.username)

    settings_path = ctx.user_home / ".claude" / "settings.json"
    _merge_settings(settings_path)
    shutil.chown(settings_path, ctx.username, ctx.username)

    bin_dir = ctx.user_home / ".devlair" / "bin"
    _install_status_script(bin_dir, ctx.username)

    return ModuleResult(status="ok", detail="settings.json merged, hooks installed, claude-status.sh deployed")


def check() -> list[CheckItem]:
    settings_path = SETTINGS_PATH.expanduser()
    hooks_ok = False
    settings_ok = False

    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text())
            settings_ok = True
            hooks = data.get("hooks", {})
            hooks_ok = "Stop" in hooks and "SessionStart" in hooks
        except (json.JSONDecodeError, OSError):
            pass

    claude_ok = runner.cmd_exists("claude")
    context_disabled = Path("~/.zshrc").expanduser().exists() and \
        "CLAUDE_CODE_DISABLE_1M_CONTEXT" in Path("~/.zshrc").expanduser().read_text()

    return [
        CheckItem("claude installed",      "ok" if claude_ok      else "warn"),
        CheckItem("settings.json managed", "ok" if settings_ok    else "warn"),
        CheckItem("Stop hook configured",  "ok" if hooks_ok       else "warn"),
        CheckItem("1M context disabled",   "ok" if context_disabled else "warn"),
    ]
