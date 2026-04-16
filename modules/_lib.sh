# devlair module shell helpers
#
# Each module script sources this library, reads a context JSON object from
# stdin, and emits JSON Lines events to stdout. stderr is reserved for debug
# output and is surfaced only when the CLI runs with --verbose.
#
# Exit codes: 0 = success, 1 = failure, 2 = skip

set -euo pipefail

CONTEXT=""

# json_escape STRING -- emit a JSON-encoded string (including the quotes).
# Prefers jq for full correctness; falls back to a minimal sed-based escape
# that handles backslash, double-quote, newline, carriage return, and tab.
json_escape() {
  if command -v jq >/dev/null 2>&1; then
    jq -Rn --arg s "$1" '$s'
  else
    local s=$1
    s=${s//\\/\\\\}
    s=${s//\"/\\\"}
    s=${s//$'\n'/\\n}
    s=${s//$'\r'/\\r}
    s=${s//$'\t'/\\t}
    printf '"%s"' "$s"
  fi
}

json_progress() {
  local message=$1 percent=${2:-}
  if [[ -n "$percent" ]]; then
    printf '{"type":"progress","message":%s,"percent":%s}\n' "$(json_escape "$message")" "$percent"
  else
    printf '{"type":"progress","message":%s}\n' "$(json_escape "$message")"
  fi
}

json_result() {
  local status=$1 detail=${2:-}
  printf '{"type":"result","status":%s,"detail":%s}\n' \
    "$(json_escape "$status")" "$(json_escape "$detail")"
}

json_check() {
  local label=$1 status=$2 detail=${3:-}
  printf '{"type":"check","label":%s,"status":%s,"detail":%s}\n' \
    "$(json_escape "$label")" "$(json_escape "$status")" "$(json_escape "$detail")"
}

json_install() {
  local tool=$1 source=$2 verified=${3:-false}
  printf '{"type":"install","tool":%s,"source":%s,"verified":%s}\n' \
    "$(json_escape "$tool")" "$(json_escape "$source")" "$verified"
}

# read_context -- consume all of stdin into the CONTEXT global.
# Must be called before ctx_get. Aborts with an error if jq is unavailable,
# since the whole protocol (ctx_get and json_escape) depends on it; silently
# returning empty values would let modules proceed on broken input.
read_context() {
  if ! command -v jq >/dev/null 2>&1; then
    printf 'devlair: jq is required but not installed\n' >&2
    exit 1
  fi
  CONTEXT=$(cat)
}

# ctx_get KEY -- extract a top-level key from CONTEXT as a string.
# Returns empty string on missing keys.
ctx_get() {
  [[ -z "$CONTEXT" ]] && return 0
  jq -r --arg k "$1" '.[$k] // empty' <<<"$CONTEXT"
}
