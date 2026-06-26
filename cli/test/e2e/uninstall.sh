#!/usr/bin/env bash
# End-to-end test for `devlair uninstall` on a real Linux box.
#
# Installs devlair the way install.sh does (compiled binary in /usr/local/bin,
# modules in /usr/local/share/devlair/modules), runs `init` for a
# systemd-free module subset, then `uninstall` and asserts the machine is back
# to a clean state — including the restored login shell and purged packages.
#
# Designed to run as root in a throwaway Ubuntu container (see
# .github/workflows/e2e-uninstall.yml). DO NOT run on a real machine.
set -uo pipefail

REPO_SRC=${REPO_SRC:-/src}      # read-only mount of the repo
WORK=/work
DEV_USER=dev
DEV_HOME=/home/$DEV_USER
MODULES="${MODULES:-zsh,tmux,shell}"

FAILED=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=1; }
hdr()  { printf '\n\033[1;35m== %s ==\033[0m\n' "$1"; }

exists()  { [[ -e "$1" ]] && pass "exists: $1" || fail "missing: $1"; }
absent()  { [[ ! -e "$1" ]] && pass "absent: $1" || fail "still present: $1"; }
has_cmd() { command -v "$1" >/dev/null 2>&1; }

dev_shell() { getent passwd "$DEV_USER" | cut -d: -f7; }
run_dl()    { sudo -u "$DEV_USER" bash -lc "sudo -n /usr/local/bin/devlair $*"; }

# ── Prereqs ────────────────────────────────────────────────────────────────
hdr "Provisioning container"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
# Intentionally NOT installing zsh/tmux — init must apt-install them, so that
# uninstall's apt-purge path is exercised on real packages.
apt-get install -y -qq curl git unzip jq sudo ca-certificates xz-utils ncurses-bin >/dev/null

# bun (for building the CLI from source)
export BUN_INSTALL=/usr/local
curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1
has_cmd bun && pass "bun installed: $(bun --version)" || { fail "bun install failed"; exit 1; }

# Non-root user with passwordless sudo — mirrors `sudo devlair` real usage.
useradd -m -s /bin/bash "$DEV_USER"
echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$DEV_USER
ORIG_SHELL="$(dev_shell)"
pass "created $DEV_USER (login shell: $ORIG_SHELL)"

# ── Build + stage like a real install ────────────────────────────────────────
hdr "Building + staging devlair"
cp -r "$REPO_SRC/cli" "$WORK"
chown -R "$DEV_USER:$DEV_USER" "$WORK"
sudo -u "$DEV_USER" bash -lc "cd $WORK && bun install --frozen-lockfile && bun run compile" >/dev/null 2>&1
[[ -x "$WORK/dist/devlair" ]] && pass "compiled dist/devlair" || { fail "compile failed"; exit 1; }

stage() {
  install -m 0755 "$WORK/dist/devlair" /usr/local/bin/devlair
  rm -rf /usr/local/share/devlair
  mkdir -p /usr/local/share/devlair
  cp -r "$WORK/modules" /usr/local/share/devlair/modules
}
stage
exists /usr/local/bin/devlair
exists /usr/local/share/devlair/modules/_lib.sh

# ── init ─────────────────────────────────────────────────────────────────────
hdr "devlair init --only $MODULES"
run_dl "init --only $MODULES" || fail "init exited non-zero"

exists "$DEV_HOME/.zimrc"
exists "$DEV_HOME/.zim"
exists "$DEV_HOME/.tmux.conf"
exists "$DEV_HOME/.tmux/plugins/tpm"
exists "$DEV_HOME/.devlair/state.json"
grep -q "skip_global_compinit" "$DEV_HOME/.zshenv" 2>/dev/null && pass ".zshenv managed" || fail ".zshenv not managed"
grep -q "# ── devlair aliases ─" "$DEV_HOME/.zshrc" 2>/dev/null && pass ".zshrc has aliases block" || fail ".zshrc missing aliases block"
[[ "$(dev_shell)" == *zsh ]] && pass "login shell switched to zsh ($(dev_shell))" || fail "login shell not zsh: $(dev_shell)"
jq -e '.original_shell' "$DEV_HOME/.devlair/state.json" >/dev/null 2>&1 && pass "state.json recorded original_shell ($(jq -r .original_shell "$DEV_HOME/.devlair/state.json"))" || fail "original_shell not recorded"
has_cmd zsh && pass "zsh package installed by init" || fail "zsh not installed"

# ── uninstall (keep sensitive, remove packages) ──────────────────────────────
hdr "devlair uninstall --yes"
run_dl "uninstall --yes" || fail "uninstall exited non-zero"

absent /usr/local/bin/devlair
absent /usr/local/share/devlair
absent "$DEV_HOME/.devlair"
absent "$DEV_HOME/.zim"
absent "$DEV_HOME/.zimrc"
absent "$DEV_HOME/.zshenv"
absent "$DEV_HOME/.tmux.conf"
absent "$DEV_HOME/.tmux/plugins"
if [[ -f "$DEV_HOME/.zshrc" ]]; then
  grep -q "devlair" "$DEV_HOME/.zshrc" && fail ".zshrc still has devlair content" || pass ".zshrc cleaned (no devlair content)"
else
  pass ".zshrc removed (was devlair-only)"
fi
[[ "$(dev_shell)" == "$ORIG_SHELL" ]] && pass "login shell restored to $ORIG_SHELL" || fail "login shell not restored: $(dev_shell)"
has_cmd zsh && fail "zsh still installed (apt purge didn't run)" || pass "zsh package purged"
has_cmd tmux && fail "tmux still installed" || pass "tmux package purged"

# ── idempotent re-run ────────────────────────────────────────────────────────
hdr "idempotent re-run"
stage   # restore binary + modules so we can invoke it again
if run_dl "uninstall --yes"; then
  pass "second uninstall exited 0 (idempotent)"
else
  fail "second uninstall errored"
fi
absent /usr/local/bin/devlair   # core removal still works on the re-run

# ── Result ───────────────────────────────────────────────────────────────────
hdr "Result"
if [[ "$FAILED" -eq 0 ]]; then
  printf '\033[1;32mALL E2E ASSERTIONS PASSED\033[0m\n'
  exit 0
else
  printf '\033[1;31mE2E FAILURES — see above\033[0m\n'
  exit 1
fi
