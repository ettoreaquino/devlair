#!/usr/bin/env bash
# Enforce Conventional Commits format on commit messages.
# Called by pre-commit as a commit-msg hook — receives the message file as $1.
set -euo pipefail

MSG_FILE="$1"
FIRST_LINE=$(head -1 "$MSG_FILE")

PATTERN='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+'

if ! echo "$FIRST_LINE" | grep -qE "$PATTERN"; then
  echo "ERROR: commit message does not follow Conventional Commits."
  echo ""
  echo "  Expected: <type>(<scope>): <description>"
  echo "  Got:      $FIRST_LINE"
  echo ""
  echo "  Valid types: feat fix docs style refactor perf test build ci chore revert"
  echo ""
  exit 1
fi
