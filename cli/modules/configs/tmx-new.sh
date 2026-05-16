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
      printf 'TELEGRAM_BOT_TOKEN=%s\n' "$TOKEN" > "$STATE_DIR/.env"
      chmod 600 "$STATE_DIR/.env"
    else
      printf 'TELEGRAM_BOT_TOKEN=\n' > "$STATE_DIR/.env"
      echo "Token skipped — set it later:"
      echo "  echo 'TELEGRAM_BOT_TOKEN=...' > $STATE_DIR/.env"
    fi

    if [ ! -f "$STATE_DIR/access.json" ]; then
      printf '{"dmPolicy":"pairing","allowFrom":[],"groups":{},"pending":{}}\n' \
        > "$STATE_DIR/access.json"
    fi

    # Update manifest (atomic write, deduped by name)
    if command -v jq >/dev/null 2>&1; then
      if [ ! -f "$MANIFEST" ]; then
        printf '{"version":1,"sessions":[]}\n' > "$MANIFEST"
      fi
      EXISTING=$(jq -r --arg n "$NAME" '.sessions[] | select(.name==$n) | .name' "$MANIFEST" 2>/dev/null || true)
      if [ -z "$EXISTING" ]; then
        jq --arg name "$NAME" \
           --arg sd "$STATE_DIR" \
           --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          '.sessions += [{"name":$name,"state_dir":$sd,"created_at":$ts}]' \
          "$MANIFEST" > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "$MANIFEST"
      fi
    else
      echo "Warning: jq not found — manifest not updated" >&2
    fi

    tmux new-session -d -s "$NAME" \
      -e "TELEGRAM_STATE_DIR=$STATE_DIR" \
      "~/.devlair/bin/claude-telegram"

    echo "Created '$NAME' with claude-telegram  →  tmx $NAME"
    exec tmux attach-session -t "$NAME"
    ;;
esac
