#!/usr/bin/env bash
# wsl-smoke-test.sh — install the devlair v2 alpha and exercise its surface
#
# Designed for a fresh Ubuntu WSL distro:
#
#   wsl --install -d Ubuntu-24.04 --name devlair-test
#   wsl -d devlair-test
#   curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/scripts/wsl-smoke-test.sh | bash
#
# Or, if you've cloned the repo inside the distro:
#
#   bash scripts/wsl-smoke-test.sh
#
# What it does:
#   1. Checks the env (WSL, arch, sudo, network).
#   2. Installs devlair via the `--pre` channel.
#   3. Verifies the version is the latest alpha.
#   4. Runs --help on every v2 command.
#   5. Runs `devlair doctor` against the bare distro (expect lots of "missing").
#   6. Runs `devlair init --group core --dry-run` if dry-run exists; otherwise prints what would run.
#   7. Reports pass/fail per step and exits non-zero if anything fundamental breaks.
#
# Hard-coded "expected" values are intentionally loose: this is a smoke test,
# not a regression suite. It catches "the binary doesn't start" / "command is
# gone" / "install script 404s" — not subtle behavior changes.

set -uo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_OK=$'\033[32m'; C_FAIL=$'\033[31m'; C_INFO=$'\033[36m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=''; C_FAIL=''; C_INFO=''; C_DIM=''; C_OFF=''
fi

PASS=0
FAIL=0
SKIP=0
FAILED_STEPS=()

step() {
  local name="$1"
  shift
  printf '%s▸%s %s ' "$C_INFO" "$C_OFF" "$name"
  if "$@" > /tmp/devlair-smoke.out 2>&1; then
    printf '%s✓%s\n' "$C_OK" "$C_OFF"
    PASS=$((PASS + 1))
    return 0
  else
    local rc=$?
    printf '%s✗%s (exit %d)\n' "$C_FAIL" "$C_OFF" "$rc"
    sed 's/^/    /' /tmp/devlair-smoke.out
    FAIL=$((FAIL + 1))
    FAILED_STEPS+=("$name")
    return $rc
  fi
}

skip() {
  printf '%s▸%s %s %s(skipped: %s)%s\n' "$C_INFO" "$C_OFF" "$1" "$C_DIM" "$2" "$C_OFF"
  SKIP=$((SKIP + 1))
}

# ── Pre-flight ────────────────────────────────────────────────────────────────
echo "${C_INFO}devlair v2-alpha smoke test${C_OFF}"
echo "${C_DIM}$(date -Is)${C_OFF}"
echo

if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "${C_FAIL}This script is intended for a WSL distro. Refusing to run.${C_OFF}" >&2
  exit 2
fi

step "WSL detected"     bash -c 'grep -qi microsoft /proc/version'
step "x86_64 or aarch64" bash -c '[[ "$(uname -m)" == "x86_64" || "$(uname -m)" == "aarch64" ]]'
step "sudo available"   bash -c 'command -v sudo > /dev/null'
step "network reachable" bash -c 'curl -fsSL --max-time 5 https://github.com > /dev/null'

# ── Install ───────────────────────────────────────────────────────────────────
echo
echo "${C_INFO}── Install (--pre channel) ──${C_OFF}"

if command -v devlair > /dev/null; then
  CURRENT=$(devlair --version 2>/dev/null | head -1 || echo "unknown")
  echo "${C_DIM}existing install: $CURRENT — reinstalling${C_OFF}"
fi

step "fetch + run install.sh --pre" \
  bash -c 'curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh \
    | sudo bash -s -- --pre'

step "devlair on PATH" command -v devlair

# ── Version sanity ────────────────────────────────────────────────────────────
echo
echo "${C_INFO}── Version sanity ──${C_OFF}"

step "devlair --version prints something" bash -c 'devlair --version | grep -E "[0-9]+\.[0-9]+\.[0-9]+"'
step "version is an alpha (--pre channel)" bash -c 'devlair --version | grep -qi alpha'

# ── Help surface ──────────────────────────────────────────────────────────────
echo
echo "${C_INFO}── Help surface ──${C_OFF}"

step "devlair --help"            devlair --help
step "devlair init --help"       devlair init --help
step "devlair doctor --help"     devlair doctor --help
step "devlair upgrade --help"    devlair upgrade --help
step "devlair claude --help"     devlair claude --help
step "devlair disable-password --help" devlair disable-password --help

# ── Doctor (non-mutating) ─────────────────────────────────────────────────────
echo
echo "${C_INFO}── doctor on bare distro ──${C_OFF}"
echo "${C_DIM}A fresh WSL distro has none of the dev tools — doctor should run cleanly and report missing items, not crash.${C_OFF}"

step "devlair doctor exits 0 or 1" bash -c 'devlair doctor; rc=$?; [[ $rc -eq 0 || $rc -eq 1 ]]'

# ── Init dry-run (if supported) ───────────────────────────────────────────────
echo
echo "${C_INFO}── init plan ──${C_OFF}"

if devlair init --help 2>&1 | grep -q -- '--dry-run\|--plan'; then
  FLAG=$(devlair init --help 2>&1 | grep -oE -- '--dry-run|--plan' | head -1)
  step "devlair init --group core $FLAG" devlair init --group core "$FLAG"
else
  skip "devlair init --group core --dry-run" "no --dry-run/--plan flag exposed"
  echo "    ${C_DIM}When you want to actually run init, do it interactively: 'devlair init --group core'${C_OFF}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "${C_INFO}── Summary ──${C_OFF}"
printf '  %s%d passed%s · %s%d failed%s · %d skipped\n' \
  "$C_OK" "$PASS" "$C_OFF" \
  "$C_FAIL" "$FAIL" "$C_OFF" \
  "$SKIP"

if (( FAIL > 0 )); then
  printf '  %sfailed steps:%s\n' "$C_FAIL" "$C_OFF"
  for s in "${FAILED_STEPS[@]}"; do
    printf '    · %s\n' "$s"
  done
  exit 1
fi

echo "  ${C_OK}all smoke checks passed.${C_OFF}"
echo "  ${C_DIM}next: run 'devlair init' interactively to exercise the wizard.${C_OFF}"
