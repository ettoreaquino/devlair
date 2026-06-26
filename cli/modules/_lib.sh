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

# json_auth_url URL MESSAGE -- surface an out-of-band authentication URL the
# user must open in a browser. Unlike `progress`, this event is sticky in the
# UI and is not cleared by subsequent progress events.
json_auth_url() {
  local url=$1 message=${2:-}
  printf '{"type":"auth_url","url":%s,"message":%s}\n' \
    "$(json_escape "$url")" "$(json_escape "$message")"
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

# _is_root -- true when the effective UID is 0.
# Caches the result in a string to avoid repeated subshell forks.
_IS_ROOT_CACHED=""
_is_root() {
  if [[ -z "$_IS_ROOT_CACHED" ]]; then
    if [[ "$(id -u)" == "0" ]]; then
      _IS_ROOT_CACHED="true"
    else
      _IS_ROOT_CACHED="false"
    fi
  fi
  [[ "$_IS_ROOT_CACHED" == "true" ]]
}

# apt_install PKG... -- install packages quietly with a progress event.
apt_install() {
  json_progress "installing $*"
  apt-get install -y -qq "$@" >&2
}

# brew_install PKG... -- install Homebrew packages quietly with a progress event.
# When running as root (sudo devlair init on macOS), drops to the target user
# because Homebrew refuses to run as root.
brew_install() {
  json_progress "installing $*"
  if _is_root; then
    sudo -u "${USERNAME:?USERNAME not set}" brew install --quiet "$@" >&2
  else
    brew install --quiet "$@" >&2
  fi
}

# brew_ensure -- ensure Homebrew is on PATH, installing it if absent.
# Uses download-then-execute to avoid piping curl to bash directly.
# After install, sources brew shellenv so subsequent brew calls work.
# When running as root, installs and invokes brew as the target user.
brew_ensure() {
  # Check if brew is accessible (either as root or as the target user)
  if cmd_exists brew; then
    return 0
  fi
  if _is_root && sudo -u "${USERNAME:?USERNAME not set}" command -v brew >/dev/null 2>&1; then
    # brew is installed for the target user; PATH just isn't set for root
    eval "$(sudo -u "$USERNAME" brew shellenv 2>/dev/null)" || true
    return 0
  fi
  json_progress "installing Homebrew"
  local tmp
  tmp=$(download_script "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh")
  if _is_root; then
    sudo -u "${USERNAME:?USERNAME not set}" NONINTERACTIVE=1 bash "$tmp" >&2
  else
    NONINTERACTIVE=1 bash "$tmp" >&2
  fi
  rm -f "$tmp"
  # Add brew to PATH for the remainder of this script session
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  else
    json_result "fail" "Homebrew installed but brew not found at expected paths"
    exit 1
  fi
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

# _run_as_user SCRIPT -- run a shell script as the module's target user.
# When already running as that user (no sudo), executes directly.
# When running as root (sudo devlair init), drops privileges via sudo -u.
# Requires USERNAME to be set (done after read_context).
_run_as_user() {
  if _is_root; then
    run_shell_as "${USERNAME:?USERNAME not set}" "$1"
  else
    bash -c "$1"
  fi
}

# download_script URL -- download an installer script to a temp file.
# Prints the temp file path; caller is responsible for cleanup.
download_script() {
  local url=$1
  local tmp
  tmp=$(mktemp /tmp/devlair.XXXXXX.sh 2>/dev/null || mktemp)
  curl -fsSL "$url" -o "$tmp" >&2
  printf '%s' "$tmp"
}

# chown_user FILE -- chown a file to the module's target user, owner only.
# Reads USERNAME from the caller's scope (set after read_context).
# No-op (and returns success) when not running as root, so the guard cannot
# poison a caller's exit status under `set -e` — e.g. a function whose last
# statement is a chown_user call would otherwise return 1 on a non-root host
# and silently abort the script. Owner only (no group): macOS primary group
# is "staff", not the username.
chown_user() {
  _is_root || return 0
  chown "${USERNAME:?USERNAME not set}" "$1"
}

# chown_user_r DIR -- recursive chown to the target user (root only; else no-op).
chown_user_r() {
  _is_root || return 0
  chown -R "${USERNAME:?USERNAME not set}" "$1"
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

# ── Uninstall helpers ──────────────────────────────────────────────────────────

# cfg_bool KEY DEFAULT -- echo a boolean config value ("true"/"false"),
# falling back to DEFAULT when the key is unset. Used by do_uninstall to read
# the keep/destroy decisions passed in ModuleContext.config.
cfg_bool() {
  local v
  v=$(ctx_get_config "$1")
  [[ -z "$v" ]] && v=$2
  echo "$v"
}

# apt_purge PKG... -- purge packages quietly with a progress event (best-effort;
# never aborts uninstall if a package is already gone or apt is unhappy).
apt_purge() {
  json_progress "removing $*"
  apt-get purge -y -qq "$@" >&2 2>&1 || true
  apt-get autoremove -y -qq >&2 2>&1 || true
}

# brew_uninstall PKG... -- uninstall Homebrew packages (best-effort). Drops to
# the target user when running as root, since brew refuses to run as root.
brew_uninstall() {
  json_progress "removing $*"
  if _is_root; then
    sudo -u "${USERNAME:?USERNAME not set}" brew uninstall "$@" >&2 2>&1 || true
  else
    brew uninstall "$@" >&2 2>&1 || true
  fi
}

# rm_user_path PATH -- rm -rf a path (best-effort). Appends the basename to the
# caller's `removed` array when the path existed. Caller must declare `removed`.
rm_user_path() {
  local p=$1
  if [[ -e "$p" || -L "$p" ]]; then
    rm -rf "$p" 2>/dev/null || true
    removed+=("$(basename "$p")")
  fi
}
