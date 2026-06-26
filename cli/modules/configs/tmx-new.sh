#!/bin/bash
# tmx-new — create named tmux sessions (plain, --claude)
# Invoked via: tmx new --name NAME [--claude]
set -euo pipefail

NAME=""
MODE="plain"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   NAME="$2"; shift 2 ;;
    --name=*) NAME="${1#--name=}"; shift ;;
    --claude) MODE="claude"; shift ;;
    *)        echo "tmx-new: unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "Usage: tmx new --name NAME [--claude]" >&2
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
esac
