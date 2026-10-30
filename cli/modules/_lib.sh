# devlair module shell helpers
#
# Each module script sources this library, reads a context JSON object from
# stdin, and emits JSON Lines events to stdout. stderr is reserved for debug
# output and is surfaced only when the CLI runs with --verbose.
#
# Exit codes: 0 = success, 1 = failure, 2 = skip

set -euo pipefail

CONTEXT=""
_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# AWS CLI team signing key (primary fingerprint, as published in the AWS CLI
# install guide). The key itself is vendored in configs/aws-cli-public-key.asc.
AWS_CLI_GPG_FPR="FB5DB77FD5C118B80511ADA8A6310ACC4672475C"

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

# json_step LABEL BEFORE AFTER RC [REASON] -- emit an upgrade row from version
# readbacks taken before and after a step. A non-zero RC is always a warn, so a
# failed upgrade can never show as ok. Sets STEP_WARNED=1 on every warn.
STEP_WARNED=0
json_step() {
  local label=$1 before=$2 after=$3 rc=$4 reason=${5:-}
  if [[ "$rc" != 0 ]]; then
    STEP_WARNED=1
    json_check "$label" "warn" "${reason:-upgrade failed (exit $rc)}${after:+; still $after}"
  elif [[ -z "$after" ]]; then
    STEP_WARNED=1
    json_check "$label" "warn" "version unreadable after upgrade"
  elif [[ "$before" == "$after" ]]; then
    json_check "$label" "ok" "unchanged ($after)"
  else
    json_check "$label" "ok" "${before:-none} -> $after"
  fi
}

# cmd_exists NAME -- check if a command is available on PATH.
cmd_exists() { command -v "$1" >/dev/null 2>&1; }

# join_by SEP ITEM... -- print ITEMs joined by the full SEP string.
# IFS-based joins ("${arr[*]}") only use the first character of IFS.
join_by() {
  local sep=$1
  shift
  (($#)) || return 0
  local out=$1
  shift
  local item
  for item in "$@"; do out+="$sep$item"; done
  printf '%s' "$out"
}

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

# brew_run ARGS... -- run brew, dropping to the target user when root.
brew_run() {
  if _is_root; then
    sudo -u "${USERNAME:?USERNAME not set}" brew "$@"
  else
    brew "$@"
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
  # Check known Homebrew paths directly — handles the case where the macOS
  # pre-flight installed/found brew but the PATH update didn't reach this subshell.
  local _brew_bin
  for _brew_bin in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$_brew_bin" ]]; then
      eval "$($_brew_bin shellenv 2>/dev/null)" || export PATH="$(dirname "$_brew_bin"):${PATH}"
      cmd_exists brew && return 0
    fi
  done
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
#
# mktemp creates the file 0600. Under `sudo devlair init` it is root-owned,
# but some installers run as the target user via `sudo -u` (uv/pyenv/nvm/bun
# through _run_as_user, Homebrew through brew_ensure), and that user cannot
# read a root-owned 0600 file — bash reports "Permission denied". Grant read
# so the dropped-privilege user can source the script.
#
# Grant read only — do NOT chown it to the user. Other installers (e.g.
# tailscale) execute the script as root via `bash "$script"`; a user-owned
# file in the sticky /tmp would let an unprivileged process rewrite it before
# root runs it (TOCTOU privilege escalation). Keeping root ownership + write
# and adding only read closes that window. The scripts are public installers,
# so world-readable leaks nothing.
download_script() {
  local url=$1
  local tmp
  tmp=$(mktemp /tmp/devlair.XXXXXX.sh 2>/dev/null || mktemp)
  curl -fsSL "$url" -o "$tmp" >&2
  chmod a+r "$tmp"
  printf '%s' "$tmp"
}

# verify_gpg_sig FILE SIG KEYFILE FPR -- verify a detached signature against a
# single pinned key. Uses a throwaway keyring so the result neither depends on
# nor pollutes root's keyring, and requires VALIDSIG to name FPR as the primary
# key, so a swapped key file or a signature by any other key fails.
verify_gpg_sig() {
  local file=$1 sig=$2 key=$3 fpr=$4 home status rc=1
  cmd_exists gpg || { echo "gpg not installed" >&2; return 1; }
  home=$(mktemp -d)
  if gpg --homedir "$home" --batch --quiet --import "$key" >&2; then
    status=$(gpg --homedir "$home" --batch --status-fd 1 --verify "$sig" "$file" 2>/dev/null) || true
    # A signature by an expired or revoked key must fail even if VALIDSIG is also emitted.
    # Refresh configs/aws-cli-public-key.asc before the pinned key expires (2027).
    if ! grep -qE '^\[GNUPG:\] (EXPKEYSIG|REVKEYSIG|EXPSIG) ' <<<"$status"; then
      grep -qE "^\[GNUPG:\] VALIDSIG .* ${fpr}\$" <<<"$status" && rc=0
    fi
  fi
  rm -rf "$home"
  return $rc
}

AWS_RC_BADSIG=3    # aws_cli_install: signature did not verify
AWS_RC_DOWNLOAD=4  # aws_cli_install: download failed

# aws_cli_install [INSTALL_ARGS...] -- download the AWS CLI v2 bundle for this
# arch, verify it against the vendored AWS key, then run its installer (pass
# --update to upgrade). Works in a private mktemp dir, never a fixed /tmp path.
# Returns AWS_RC_BADSIG when the signature does not verify, AWS_RC_DOWNLOAD when a download fails (nothing
# is installed in either case), else the installer's exit code. Linux only.
aws_cli_install() {
  local aws_arch work rc=0
  cmd_exists gpg || apt_install gnupg
  [[ "$(uname -m)" == "x86_64" ]] && aws_arch="x86_64" || aws_arch="aarch64"
  local base="https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip"
  work=$(mktemp -d)
  if ! curl -fsSL "$base" -o "$work/awscliv2.zip" >&2 || ! curl -fsSL "${base}.sig" -o "$work/awscliv2.zip.sig" >&2; then
    rc=$AWS_RC_DOWNLOAD
  elif ! verify_gpg_sig "$work/awscliv2.zip" "$work/awscliv2.zip.sig" \
    "$_LIB_DIR/configs/aws-cli-public-key.asc" "$AWS_CLI_GPG_FPR"; then
    echo "AWS CLI signature did not verify against $AWS_CLI_GPG_FPR" >&2
    rc=$AWS_RC_BADSIG
  else
    { unzip -qo "$work/awscliv2.zip" -d "$work" && "$work/aws/install" "$@"; } >&2 || rc=$?
  fi
  rm -rf "$work"
  return $rc
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
  # -h: chown the path itself, not its target. Without it, chowning a
  # symlink (e.g. the VS Code CLI shim in ~/.devlair/bin) follows the link
  # and re-owns whatever it points to instead.
  chown -h "${USERNAME:?USERNAME not set}" "$1"
}

# chown_user_r DIR -- recursive chown to the target user (root only; else no-op).
chown_user_r() {
  _is_root || return 0
  chown -R -h "${USERNAME:?USERNAME not set}" "$1"
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
