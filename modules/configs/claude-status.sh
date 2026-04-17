#!/bin/bash
ACTIVE="$HOME/.claude/devlair-active"
SESSIONS="$HOME/.claude/devlair-sessions.jsonl"

if [ -f "$ACTIVE" ]; then
  PID=$(jq -r '.pid // 0' "$ACTIVE" 2>/dev/null)
  if [ "$PID" -gt 0 ] && kill -0 "$PID" 2>/dev/null; then
    MODEL=$(jq -r '.model // ""' "$ACTIVE" 2>/dev/null \
      | sed 's/claude-//' | sed 's/-.*//' | cut -c1-6)
    CH=$(jq -r '.channels // ""' "$ACTIVE" 2>/dev/null)
    OUT="CC:${MODEL}"
    if [ -n "$CH" ]; then
      CH_COUNT=$(echo "$CH" | tr ',' '\n' | grep -c .)
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
