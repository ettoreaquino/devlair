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

# ctx_get_config KEY -- extract a key from CONTEXT.config as a string.
ctx_get_config() {
  [[ -z "$CONTEXT" ]] && return 0
  jq -r --arg k "$1" '.config[$k] // empty' <<<"$CONTEXT"
}

# ── Shell helpers ────────────────────────────────────────────────────────────

# cmd_exists NAME -- check if a command is available on PATH.
cmd_exists() { command -v "$1" >/dev/null 2>&1; }

# apt_install PKG... -- install packages quietly with a progress event.
apt_install() {
  json_progress "installing $*"
  apt-get install -y -qq "$@" >&2
}

# run_as USER CMD... -- run a command as another user via sudo.
run_as() {
  local user=$1; shift
  sudo -u "$user" "$@"
}

# run_shell_as USER SCRIPT -- run a bash script as another user.
run_shell_as() {
  local user=$1 script=$2
  sudo -u "$user" bash -c "$script"
}

# download_script URL -- download an installer script to a temp file.
# Prints the temp file path; caller is responsible for cleanup.
download_script() {
  local url=$1
  local tmp
  tmp=$(mktemp --suffix=.sh)
  chmod 644 "$tmp"
  curl -fsSL "$url" -o "$tmp" 2>&2
  printf '%s' "$tmp"
}

# chown_user FILE -- chown a file to the module's target user.
# Reads USERNAME from the caller's scope (set after read_context).
chown_user() { chown "${USERNAME:?USERNAME not set}:${USERNAME}" "$1"; }

# chown_user_r DIR -- recursive chown to the target user.
chown_user_r() { chown -R "${USERNAME:?USERNAME not set}:${USERNAME}" "$1"; }

# add_ufw_rule RULE COMMENT -- add a UFW rule idempotently.
# Skips if a rule with the same comment already exists.
add_ufw_rule() {
  local rule=$1 comment=$2
  if ! ufw status verbose 2>/dev/null | grep -qF "$comment"; then
    eval ufw "$rule" comment "'$comment'" >&2
  fi
}

# update_json FILE PATCH_JSON -- shallow-merge a JSON patch into a file.
# Creates the file with the patch content if it does not exist.
update_json() {
  local file=$1 patch=$2
  if [[ -f "$file" ]]; then
    local merged
    merged=$(jq -s '.[0] * .[1]' "$file" <(printf '%s' "$patch"))
    printf '%s\n' "$merged" > "$file"
  else
    printf '%s\n' "$patch" | jq '.' > "$file"
  fi
}
