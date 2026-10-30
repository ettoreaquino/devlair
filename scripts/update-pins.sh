#!/usr/bin/env bash
# update-pins.sh -- refresh cli/modules/pins.json from upstream.
#
# Every third-party installer devlair executes is pinned there by URL and
# SHA-256 (see download_pinned in cli/modules/_lib.sh). This resolves each
# tool's newest release tag (or default-branch commit, for repos without
# releases), downloads the installer from that immutable ref and records its
# hash. claude.ai/install.sh has no versioned URL, so only its hash moves.
#
# Usage: scripts/update-pins.sh   (needs gh, curl, jq and sha256sum)
# Prints one "tool old -> new" line per changed pin; silent when up to date.
set -euo pipefail

PINS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli/modules/pins.json"
GH_RAW=https://raw.githubusercontent.com

latest_tag() { gh api "repos/$1/releases/latest" --jq .tag_name; }
head_sha() { gh api "repos/$1/commits/$(gh api "repos/$1" --jq .default_branch)" --jq .sha; }

# resolve TOOL -- print "VERSION URL" for TOOL's newest upstream installer.
resolve() {
  local v
  case "$1" in
    uv) v=$(latest_tag astral-sh/uv); echo "$v https://github.com/astral-sh/uv/releases/download/$v/uv-installer.sh" ;;
    pyenv) v=$(head_sha pyenv/pyenv-installer); echo "$v $GH_RAW/pyenv/pyenv-installer/$v/bin/pyenv-installer" ;;
    nvm) v=$(latest_tag nvm-sh/nvm); echo "$v $GH_RAW/nvm-sh/nvm/$v/install.sh" ;;
    bun) v=$(latest_tag oven-sh/bun); echo "$v $GH_RAW/oven-sh/bun/$v/src/runtime/cli/install.sh" ;;
    claude) echo "- https://claude.ai/install.sh" ;;
    tailscale) v=$(latest_tag tailscale/tailscale); echo "$v $GH_RAW/tailscale/tailscale/$v/scripts/installer.sh" ;;
    homebrew) v=$(head_sha Homebrew/install); echo "$v $GH_RAW/Homebrew/install/$v/install.sh" ;;
    homebrew-uninstall) v=$(head_sha Homebrew/install); echo "$v $GH_RAW/Homebrew/install/$v/uninstall.sh" ;;
    zimfw) v=$(latest_tag zimfw/zimfw); echo "$v https://github.com/zimfw/zimfw/releases/download/$v/zimfw.zsh" ;;
    *) echo "unknown tool: $1" >&2; return 1 ;;
  esac
}

TOOLS=(uv pyenv nvm bun claude tailscale homebrew homebrew-uninstall zimfw)

[[ -f "$PINS" ]] || echo '{}' >|"$PINS"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for tool in "${TOOLS[@]}"; do
  read -r version url < <(resolve "$tool")
  [[ "$version" == "-" ]] && version=""
  curl -fsSL "$url" -o "$tmp"
  sha=$(sha256sum "$tmp" | cut -d' ' -f1)
  old=$(jq -r --arg t "$tool" '.[$t].sha256 // "none"' "$PINS")
  [[ "$old" == "$sha" ]] && continue
  echo "$tool $(jq -r --arg t "$tool" '.[$t].version // "none"' "$PINS") -> ${version:-$sha}"
  jq --arg t "$tool" --arg v "$version" --arg u "$url" --arg s "$sha" \
    '.[$t] = {version: $v, url: $u, sha256: $s}' "$PINS" >|"$PINS.new"
  mv "$PINS.new" "$PINS"
done
