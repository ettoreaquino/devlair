import json
import shutil
import stat
from pathlib import Path

from devlair import runner
from devlair.context import CheckItem, ModuleResult, SetupContext, update_json

LABEL = "Claude Code"

SETTINGS_PATH = Path("~/.claude/settings.json")

DEVLAIR_MANAGED_KEYS = {"model", "effortLevel", "hooks", "channelsEnabled", "allowedChannelPlugins"}

DEVLAIR_SETTINGS = {
    "model": "sonnet",
    "effortLevel": "medium",
    "channelsEnabled": True,
    "allowedChannelPlugins": [{"marketplace": "claude-plugins-official", "plugin": "telegram"}],
    "hooks": {
        "SessionStart": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": (
                            "jq -c '{pid:(env.PPID|tonumber? // 0),session_id,model,cwd,"
                            'channels:(env.CLAUDE_CHANNELS // ""),'
                            "started_at:(now|todate)}' > ~/.claude/devlair-active; "
                            "tmux refresh-client -S 2>/dev/null; true"
                        ),
                    }
                ],
            }
        ],
        "Stop": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": (
                            "jq -c '{session_id,transcript_path,cwd,ended_at:(now|todate)}'"
                            " >> ~/.claude/devlair-sessions.jsonl; "
                            "rm -f ~/.claude/devlair-active; "
                            "tmux refresh-client -S 2>/dev/null; true"
                        ),
                    }
                ],
            }
        ],
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
    CH=$(jq -r '.channels // ""' "$ACTIVE" 2>/dev/null)
    OUT="CC:${MODEL}"
    if [ -n "$CH" ]; then
      CH_COUNT=$(echo "$CH" | tr ',' '\\n' | grep -c .)
      OUT="${OUT} CH:${CH_COUNT}"
    fi
    echo "$OUT"
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


CLAUDE_TELEGRAM_SH = """\
#!/bin/bash
exec claude --channels plugin:telegram@claude-plugins-official "$@"
"""

TMX_NEW_SH = """\
#!/bin/bash
# tmx-new — create named tmux sessions (plain, --claude, --claude-telegram)
# Invoked via: tmx new --name NAME [--claude] [--claude-telegram]
set -euo pipefail

MANIFEST="$HOME/.claude/channels/manifest.json"
CHANNELS_DIR="$HOME/.claude/channels"
NAME=""
MODE="plain"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)            NAME="$2"; shift 2 ;;
    --name=*)          NAME="${1#--name=}"; shift ;;
    --claude)          MODE="claude"; shift ;;
    --claude-telegram) MODE="claude-telegram"; shift ;;
    *)                 echo "tmx-new: unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "Usage: tmx new --name NAME [--claude] [--claude-telegram]" >&2
  exit 1
fi

if tmux has-session -t "$NAME" 2>/dev/null; then
  echo "Session '$NAME' already exists — use: tmx $NAME" >&2
  exit 1
fi

case "$MODE" in
  plain)
    tmux new-session -d -s "$NAME"
    echo "Created '$NAME'  →  tmx $NAME"
    exec tmux attach-session -t "$NAME"
    ;;

  claude)
    tmux new-session -d -s "$NAME" "claude"
    echo "Created '$NAME' with Claude Code  →  tmx $NAME"
    exec tmux attach-session -t "$NAME"
    ;;

  claude-telegram)
    STATE_DIR="$CHANNELS_DIR/telegram-${NAME}"
    mkdir -p "$STATE_DIR"

    # Token prompt (skip-able; skipped automatically in non-TTY contexts)
    TOKEN=""
    if [ -t 0 ]; then
      printf "Telegram bot token (Enter to skip): "
      IFS= read -r TOKEN
    fi

    if [ -n "$TOKEN" ]; then
      printf 'TELEGRAM_BOT_TOKEN=%s\\n' "$TOKEN" > "$STATE_DIR/.env"
      chmod 600 "$STATE_DIR/.env"
    else
      printf 'TELEGRAM_BOT_TOKEN=\\n' > "$STATE_DIR/.env"
      echo "Token skipped — set it later:"
      echo "  echo 'TELEGRAM_BOT_TOKEN=...' > $STATE_DIR/.env"
    fi

    if [ ! -f "$STATE_DIR/access.json" ]; then
      printf '{"dmPolicy":"pairing","allowFrom":[],"groups":{},"pending":{}}\\n' \\
        > "$STATE_DIR/access.json"
    fi

    # Update manifest (atomic write, deduped by name)
    if command -v jq >/dev/null 2>&1; then
      if [ ! -f "$MANIFEST" ]; then
        printf '{"version":1,"sessions":[]}\\n' > "$MANIFEST"
      fi
      EXISTING=$(jq -r --arg n "$NAME" '.sessions[] | select(.name==$n) | .name' "$MANIFEST" 2>/dev/null || true)
      if [ -z "$EXISTING" ]; then
        jq --arg name "$NAME" \\
           --arg sd "$STATE_DIR" \\
           --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \\
          '.sessions += [{"name":$name,"state_dir":$sd,"created_at":$ts}]' \\
          "$MANIFEST" > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "$MANIFEST"
      fi
    else
      echo "Warning: jq not found — manifest not updated" >&2
    fi

    tmux new-session -d -s "$NAME" \\
      -e "TELEGRAM_STATE_DIR=$STATE_DIR" \\
      "~/.devlair/bin/claude-telegram"

    echo "Created '$NAME' with claude-telegram  →  tmx $NAME"
    exec tmux attach-session -t "$NAME"
    ;;
esac
"""


def _merge_settings(path: Path) -> None:
    """Merge devlair-owned keys into settings.json, preserving all other user keys."""
    update_json(path, DEVLAIR_SETTINGS)


def _install_script(bin_dir: Path, name: str, content: str, username: str) -> None:
    bin_dir.mkdir(parents=True, exist_ok=True)
    script = bin_dir / name
    script.write_text(content)
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    shutil.chown(script, username, username)
    shutil.chown(bin_dir, username, username)


TELEGRAM_MARKETPLACE = "anthropics/claude-plugins-official"
TELEGRAM_PLUGIN = "telegram@claude-plugins-official"


def _ensure_telegram_plugin(username: str) -> str:
    """Add the official marketplace and install the Telegram plugin (idempotent)."""
    details = []

    # Add marketplace if not present
    result = runner.run_as(
        username,
        ["claude", "plugin", "marketplace", "list", "--json"],
        capture=True,
        check=False,
    )
    marketplaces = json.loads(result.stdout) if result.returncode == 0 else []
    has_marketplace = any(m.get("name") == "claude-plugins-official" for m in marketplaces)

    if not has_marketplace:
        runner.run_as(
            username,
            ["claude", "plugin", "marketplace", "add", TELEGRAM_MARKETPLACE],
            capture=True,
        )
        details.append("marketplace added")

    # Install plugin if not present
    result = runner.run_as(
        username,
        ["claude", "plugin", "list", "--json"],
        capture=True,
        check=False,
    )
    plugins = json.loads(result.stdout) if result.returncode == 0 else []
    has_plugin = any(p.get("name") == "telegram" and p.get("marketplace") == "claude-plugins-official" for p in plugins)

    if not has_plugin:
        runner.run_as(
            username,
            ["claude", "plugin", "install", TELEGRAM_PLUGIN],
            capture=True,
        )
        details.append("telegram plugin installed")

    return ", ".join(details) if details else "telegram plugin already installed"


def run(ctx: SetupContext) -> ModuleResult:
    claude_dir = ctx.user_home / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    shutil.chown(claude_dir, ctx.username, ctx.username)

    settings_path = ctx.user_home / ".claude" / "settings.json"
    _merge_settings(settings_path)
    shutil.chown(settings_path, ctx.username, ctx.username)

    bin_dir = ctx.user_home / ".devlair" / "bin"
    _install_script(bin_dir, "claude-status.sh", CLAUDE_STATUS_SH, ctx.username)
    _install_script(bin_dir, "claude-telegram", CLAUDE_TELEGRAM_SH, ctx.username)
    _install_script(bin_dir, "tmx-new", TMX_NEW_SH, ctx.username)

    # Install Telegram channel plugin (requires claude CLI)
    plugin_detail = ""
    if runner.cmd_exists("claude"):
        try:
            plugin_detail = _ensure_telegram_plugin(ctx.username)
        except Exception as exc:
            plugin_detail = f"telegram plugin failed: {exc}"

    detail = "settings.json merged, hooks installed, scripts deployed"
    if plugin_detail:
        detail += f", {plugin_detail}"
    return ModuleResult(status="ok", detail=detail)


def check() -> list[CheckItem]:
    settings_path = SETTINGS_PATH.expanduser()
    hooks_ok = False
    settings_ok = False
    channels_enabled = False
    telegram_allowed = False

    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text())
            settings_ok = True
            hooks = data.get("hooks", {})
            hooks_ok = "Stop" in hooks and "SessionStart" in hooks
            channels_enabled = data.get("channelsEnabled") is True
            for plugin in data.get("allowedChannelPlugins", []):
                if plugin.get("plugin") == "telegram":
                    telegram_allowed = True
                    break
        except (json.JSONDecodeError, OSError):
            pass

    claude_ok = runner.cmd_exists("claude")
    context_disabled = (
        Path("~/.zshrc").expanduser().exists()
        and "CLAUDE_CODE_DISABLE_1M_CONTEXT" in Path("~/.zshrc").expanduser().read_text()
    )
    telegram_wrapper = Path("~/.devlair/bin/claude-telegram").expanduser().exists()
    tmx_new_ok = Path("~/.devlair/bin/tmx-new").expanduser().exists()
    bun_ok = runner.cmd_exists("bun") or Path("~/.bun/bin/bun").expanduser().exists()
    telegram_env = Path("~/.claude/channels/telegram/.env").expanduser().exists()

    # Check if telegram plugin is installed
    plugin_installed = False
    if claude_ok:
        try:
            result = runner.run(
                ["claude", "plugin", "list", "--json"],
                capture=True,
                check=False,
            )
            plugins = json.loads(result.stdout) if result.returncode == 0 else []
            plugin_installed = any(
                p.get("name") == "telegram" and p.get("marketplace") == "claude-plugins-official" for p in plugins
            )
        except (json.JSONDecodeError, OSError):
            pass

    return [
        CheckItem("claude installed", "ok" if claude_ok else "warn"),
        CheckItem("settings.json managed", "ok" if settings_ok else "warn"),
        CheckItem("Stop hook configured", "ok" if hooks_ok else "warn"),
        CheckItem("1M context disabled", "ok" if context_disabled else "warn"),
        CheckItem("channels enabled", "ok" if channels_enabled else "warn"),
        CheckItem("telegram plugin allowed", "ok" if telegram_allowed else "warn"),
        CheckItem("telegram plugin installed", "ok" if plugin_installed else "warn"),
        CheckItem("claude-telegram", "ok" if telegram_wrapper else "warn"),
        CheckItem("tmx-new script", "ok" if tmx_new_ok else "warn"),
        CheckItem("bun installed", "ok" if bun_ok else "warn"),
        CheckItem("telegram token configured", "ok" if telegram_env else "warn"),
    ]
