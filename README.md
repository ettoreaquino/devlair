<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
  <img alt="devlair" src="assets/logo.svg" width="480">
</picture>

**One command to provision a fully configured Ubuntu or WSL development machine.**

[![Release](https://img.shields.io/github/v/release/ettoreaquino/devlair?style=flat-square)](https://github.com/ettoreaquino/devlair/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/ettoreaquino/devlair/lint.yml?style=flat-square&label=CI)](https://github.com/ettoreaquino/devlair/actions)
[![Platform](https://img.shields.io/badge/platform-Ubuntu_%7C_WSL-E95420?style=flat-square&logo=ubuntu&logoColor=white)](https://ubuntu.com)
[![License](https://img.shields.io/github/license/ettoreaquino/devlair?style=flat-square)](LICENSE)

</div>

---

devlair automates the setup of a fresh Ubuntu server, workstation, or WSL instance — installing tools,
hardening security, configuring shell and terminal with the [Dracula](https://draculatheme.com) theme,
and wiring up dev toolchains. Run it once on a fresh machine or re-run anytime to converge.

## Quick start

**macOS**
```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash
devlair init
```

**Linux / WSL**
```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
devlair init
```

The installer auto-elevates only when `/usr/local/bin` is not writable — on macOS with Homebrew that's usually not needed. `devlair init` takes care of the rest.

## Why devlair

<table>
<tr>
<td width="33%" valign="top">

**Idempotent**

Run it once or a hundred times — devlair always converges to the desired state. Re-run after a failure, on a new machine, or just to update your config.

</td>
<td width="33%" valign="top">

**Security-first**

SSH hardening, UFW firewall, Fail2Ban, and Tailscale VPN are set up out of the box on Linux. On WSL, network modules that require `systemctl` are auto-skipped. Disable password auth with a single command when you're ready.

</td>
<td width="33%" valign="top">

**Composable**

13 modules you can run individually with `--only` or skip with `--skip`. Each module is self-contained and does one thing well.

</td>
</tr>
</table>

## Commands

<!-- Version in the help snapshot is static; update when cutting a release. -->

```
╭────────────────────────────────────────────────╮
│  ░░▒▒▓▓██                            ██▓▓▒▒░░  │
│               ╔═══════════════╗                │
│               ║ d e v l a i r ║                │
│               ╚═══════════════╝                │
│  ░░▒▒▓▓██                            ██▓▓▒▒░░  │
╰────────────────────────────────────────────────╯
  vX.Y.Z

  Setup & Health
    init [--only MOD] [--skip MOD] [--group GRP] [--config FILE] [--brand NAME]  Interactive wizard (or non-interactive with flags)
    doctor [--fix]                      Check system health & fix drift
    upgrade [--no-self]                 Upgrade tools & re-apply configs
    disable-password                    Lock SSH to key-only auth

  AI Agents & Channels
    claude [--plan TIER] [--1m on|off]  Usage dashboard & config

  tmux Sessions
    t                                   Start/attach default 'dev' session
    tmx <name>                          Attach to a named session
    tmx new --name N                    Create a plain session
    tmx new --name N --claude           Session with Claude Code
    tmx new --name N --claude-telegram  Create Telegram channel
    Ctrl+A  y                           Claude Code popup (any session)

  Options:  --version -v  Show version    --help  Show this screen
```

## Usage examples

```bash
# Interactive wizard — walks you through group and module selection
devlair init

# Run specific modules only
devlair init --only ssh,tmux

# Run module groups
devlair init --group core,coding

# Install opt-in modules
devlair init --only claude

# Skip specific modules
devlair init --skip devtools,gnome_terminal

# Setup from a YAML profile
devlair init --config setup.yaml

# Check system health
devlair doctor

# Diagnose and auto-fix config drift
devlair doctor --fix

# Upgrade all tools + re-apply configs + update devlair itself
devlair upgrade
```


<details>
<summary><b>Claude Code dashboard</b></summary>

```bash
# Claude Code usage dashboard
devlair claude

# Set your Claude Max plan tier
devlair claude --plan max5x

# Show Telegram channel configuration
devlair claude --channels
```

</details>

<details>
<summary><b>tmux sessions</b></summary>

```bash
# Start/attach default session
t

# Attach to a named session
tmx work

# Create a new session
tmx new --name work

# Create session with Claude Code running
tmx new --name work --claude

# Create a Telegram bot session
tmx new --name support --claude-telegram
```

</details>

## Claude Code integration

devlair hooks into Claude Code to track session usage and display a dashboard:

```
╭──────────────────────── devlair  claude  max5x ─────────────────────────╮
│  session  ████░░░░░░░░░░░░░░░░░░  7%  ~$4.20  3.1M in 25K out         │
│                                        resets in ~3h38m                │
│                                                                        │
│  all models  ██░░░░░░░░░░░░░░░░░░░░  4%  ~$78  45M in 170K out        │
│                                        resets Fri 09:00 AM · 20 sess.  │
│                                                                        │
│  sonnet only  █░░░░░░░░░░░░░░░░░░░░░  2%  ~$12  27M in 77K out        │
│                                        resets Mon 09:00 AM · 7 sess.   │
╰────────────────────────────────────────────────────────────────────────╯
```

- **Session** — 5h rolling window: percentage of estimated plan budget, cost at API rates, token counts, reset countdown
- **All models** — weekly usage against total budget, resets every Friday 09:00; session count
- **Sonnet only** — weekly Sonnet usage tracked separately, resets every Monday 09:00
- **Plan-aware** — supports `pro`, `max5x`, and `max20x` tiers (`devlair claude --plan <tier>`)
- **Automatic hooks** — `SessionStart` and `Stop` hooks in `~/.claude/settings.json` track sessions for the tmux status bar

## What gets installed

`devlair init` runs these modules in order. Some modules are **opt-in** and not included in a default run — use `devlair init --only <module>` or `--group` to enable them. Opt-in modules: `claude`; `tailscale` is opt-in on WSL and macOS. Portable modules (supported on Linux, WSL, and macOS): `system`, `tailscale`, `zsh`, `tmux`, `rclone`, `github`, `shell`, `claude`, `devtools`. macOS-only modules (auto-skipped on Linux/WSL): `homebrew` (Homebrew preamble — on macOS, `ensureHomebrew()` runs before the Ink UI starts so the installer has full TTY access for sudo prompts; the `homebrew` module is a dependency of `system`, `zsh`, `tmux`, and `devtools` on macOS). Linux-only modules (auto-skipped elsewhere): `firewall`, `gnome_terminal`, `ssh`, `timezone`.

<details>
<summary><b>System</b> — OS packages and essentials</summary>

Runs `apt update && upgrade` and installs core packages: `git`, `curl`, `vim`, `htop`, `tmux`, `zsh`, `bat`, `fzf`, `build-essential`, and more. On bare Linux it also installs `openssh-server`, `ufw`, `fail2ban`, and `avahi-daemon`; these are skipped on WSL because they ship systemd-managed postinst scripts that don't work under WSL's systemd-less default (the dedicated `ssh` and `firewall` modules are also Linux-only). On macOS, Homebrew is guaranteed to be on PATH before this module runs (installed by the pre-flight `ensureHomebrew()` call in `index.tsx`). The module runs `brew update && brew upgrade` and installs a set of macOS essentials via `brew install` (`git`, `curl`, `wget`, `vim`, `htop`, `tmux`, `unzip`, `jq`, `tree`, `rsync`, `zsh`, `bat`, `fzf`, `gnupg`).

</details>

<details>
<summary><b>Timezone</b> — interactive timezone configuration</summary>

Displays the current timezone and prompts for a new one. Uses `timedatectl set-timezone` on Linux/WSL. The configured timezone is IANA-validated before being applied; `do_check` reports `fail` when the timezone cannot be read. Linux-only — auto-skipped on WSL and macOS.

</details>

<details>
<summary><b>Tailscale</b> — VPN for secure remote access</summary>

Installs [Tailscale](https://tailscale.com) and walks you through browser-based authentication. Your Tailscale IP is used to restrict SSH access.

</details>

<details>
<summary><b>SSH server</b> — hardened configuration + key setup</summary>

Creates `/etc/ssh/sshd_config.d/99-hardened.conf` with:
- Root login disabled
- Public key auth enabled
- Max 3 auth attempts
- ListenAddress restricted to Tailscale IP (when available)

Prompts for your SSH public key if `authorized_keys` is empty. Linux-only — auto-skipped on macOS and WSL.

</details>

<details>
<summary><b>Firewall</b> — UFW + Fail2Ban</summary>

Resets and configures UFW (default deny incoming, allow outgoing). Sets up Fail2Ban with 1-hour ban times and 3 max retries.

</details>

<details>
<summary><b>Zsh</b> — shell + Dracula prompt</summary>

Installs zsh, sets it as default, and configures [zimfw](https://zimfw.sh) with:
- [Dracula](https://draculatheme.com) prompt theme
- `zsh-autosuggestions`
- `zsh-syntax-highlighting`
- `zsh-completions`

</details>

<details>
<summary><b>tmux</b> — Dracula-themed multiplexer</summary>

Writes `~/.tmux.conf` with Dracula colors, `C-a` prefix, mouse support, 50k line history, and intuitive split bindings (`|` and `-`). Vi copy-mode with mouse drag selection piped to the system clipboard (`pbcopy` on macOS, `wl-copy` on Wayland, `xclip` on X11, OSC 52 fallback). Installs `wl-clipboard` automatically on Linux/WSL when no clipboard tool is found. Includes [TPM](https://github.com/tmux-plugins/tpm), [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) + [tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) for automatic session save/restore — TPM plugins are installed non-interactively during init/upgrade. Claude Code popup on `C-a y`.

</details>

<details>
<summary><b>Dev tools</b> — 8 essential tools</summary>

Installs (skipping any that already exist):

| Tool | Purpose |
|------|---------|
| [uv](https://docs.astral.sh/uv/) | Python package manager |
| [pyenv](https://github.com/pyenv/pyenv) | Python version manager + latest LTS |
| [nvm](https://github.com/nvm-sh/nvm) | Node.js version manager + LTS |
| [fzf](https://github.com/junegunn/fzf) | Fuzzy finder |
| [Docker](https://www.docker.com/) | Containers + Compose |
| [gh](https://cli.github.com/) | GitHub CLI |
| [aws](https://aws.amazon.com/cli/) | AWS CLI v2 |
| [Bun](https://bun.sh/) | JavaScript runtime (required for Claude Code channels) |

On macOS, `uv`, `bun`, `pyenv`, `gh`, and `aws` are installed via `brew` instead of apt/curl. Build dependencies for pyenv (openssl, readline, sqlite3, xz, zlib) are also installed via brew. Docker is not installed on macOS — the module prints guidance to install Docker Desktop for Mac and continues without error.

</details>


<details>
<summary><b>GitHub</b> — SSH key + git config</summary>

Generates an `ed25519` SSH key for GitHub, configures `~/.ssh/config`, tests the connection, and sets `git` user/email globally.

</details>

<details>
<summary><b>Shell</b> — aliases + login banner</summary>

Appends aliases to `.zshrc` and a `tmx` command for session management. Aliases are platform-aware: `ll`, `ports`, and `update` expand differently on macOS (`ls -G`, `lsof`, `brew`) vs Linux/WSL (`ls --color`, `ss`, `apt`). The `BROWSER` env var is set to `open` on macOS and `wslview` on WSL. The login banner shows live tmux sessions and named channel sessions:

```
╭─ myhost ──────────────────────────────────────╮
│  100.64.0.1  disk 3.2G/50G  mem 8.1G/15G     │
│                                               │
│  tmux:                                        │
│    dev                       → tmx dev        │
│    work                      → tmx work       │
│                                               │
│  channels:                                    │
│    ● work-bot                → tmx work-bot   │
│    ○ staging-bot             → tmx staging-bot│
╰───────────────────────────────────────────────╯
```

`●` = token configured and at least one user authenticated; `○` = session exists but not yet ready.

</details>

<details>
<summary><b>GNOME Terminal</b> — Dracula color scheme</summary>

Applies the full 16-color Dracula palette to your default GNOME Terminal profile.

</details>

<details>
<summary><b>Claude Code</b> — hooks, settings, channels, and status bar</summary>

Merges devlair-managed keys into `~/.claude/settings.json` (model, effort level, session hooks, channels). Enables Claude Code [channels](https://docs.anthropic.com/en/docs/claude-code/channels) with the Telegram plugin — deploys `claude-telegram` and `tmx-new` commands. The tmux status bar shows the active model and channel count (`CC:sonnet CH:1`). Named Telegram sessions are created via `tmx new --name <n> --claude-telegram`; each gets an isolated bot state dir and appears in the login banner. Use `devlair claude --channels` to view configuration.

</details>

## Health check

```bash
devlair doctor
```

Verifies every component without making changes — checks installed tools, config files, service status, and SSH connectivity. Use `--fix` to automatically re-apply configurations and install missing dev tools for modules with detected drift.

## Upgrading

```bash
devlair upgrade
```

Checks for a new devlair binary first — if a new version is available, it downloads, replaces, and re-execs so the rest of the upgrade runs new code. Then upgrades system packages and any tools that were installed during init (Docker, GitHub CLI, AWS CLI, pyenv/Python, nvm/Node, Bun). After upgrading, automatically re-applies module configurations (hooks, settings, shell aliases) so new config shapes take effect immediately. Use `--no-self` to skip the binary update.

## Requirements

- **OS:** Ubuntu 24.04 LTS, WSL 2 (Ubuntu), or macOS (portable modules only — see module list above)
- **Arch:** x86_64 or aarch64
- **Privileges:** root or a user with `sudo`
- **WSL extras:** Docker Desktop for Windows with WSL integration enabled (for Docker-dependent modules)

## Development

### v1 (Python — stable)

```bash
git clone git@github.com:ettoreaquino/devlair.git
cd devlair
uv sync --group dev
uv run pytest tests/unit/
uv run ruff check devlair/ tests/
```

### v2 (TypeScript + Ink — stable)

**Install v2 (default):**

```bash
# macOS
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash

# Linux / WSL
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
```

The installer downloads the latest `devlair-cli-{os}-{arch}` binary and places it at `/usr/local/bin/devlair`. The companion `modules.tar.gz` (shell scripts invoked by the wizard) is verified against `checksums.txt` and extracted to `/usr/local/share/devlair/modules/`. To install the legacy v1 (Python) instead, pass `--v1`.

**Removed in v2** (vs. v1):

| Command | Replacement |
|---------|-------------|
| `devlair filesystem` | Removed — not ported |
| `devlair sync` / rclone | Removed — not ported |
| `devlair claude` usage dashboard | Pin to v1 for the dashboard. v2 `devlair claude` prints a short status panel only (plan + model); `--plan`, `--1m on\|off`, and `--channels` still work for configuration. |

**Ported in v2:**

| Command | Notes |
|---------|-------|
| `devlair disable-password [--yes]` | Linux-only, auto-elevates via sudo. `--yes` skips the interactive confirmation. |
| `devlair claude [--plan TIER\|--1m on\|off\|--channels]` | Configures the local Claude Code install. No dashboard (see above). |

**v2 wizard behavior notes:**

- **GitHub config step** — when the `github` module is selected in the wizard, a dedicated `wizard-github` step collects `github_email` (required, regex-validated) and `github_name` (optional) before execution begins. In non-interactive mode (`--config`), `github_email` must be supplied via `config.github_email` in the profile YAML or the command exits with an error.
- **Tailscale auth** — browser-based Tailscale authentication waits indefinitely. There is no timeout; the wizard's `AbortController` / SIGTERM is the only cancellation path (Ctrl-C).

**Develop locally:**

```bash
cd cli
bun install
bun run dev          # run in development
bun run typecheck    # tsc --noEmit
bun run lint         # biome check
bun run compile      # standalone binary → dist/devlair
```

### Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please). Conventional Commits on `main` determine version bumps (`fix:` → patch, `feat:` → minor, `feat!:` → major). Release-please maintains a "Release PR" with the changelog; merging it triggers a GitHub Release and binary builds for both architectures. **Never tag manually.**

### Project structure

```
devlair/                # v1 Python CLI (stable)
  cli.py               # Typer CLI entrypoint
  runner.py             # subprocess helpers
  context.py            # shared types, user resolution, JSON config helpers
  console.py            # Rich console + Dracula color tokens
  modules/              # one file per init module (13 modules)
  features/             # doctor, upgrade, disable-password, filesystem, claude, sync, audit, profile
cli/                    # v2 TypeScript CLI (stable)
  src/
    index.tsx           # Ink app entrypoint
    commands/           # init, doctor, upgrade, claude, disable-password
    components/         # Ink UI components (Logo, Help, Progress, Summary)
    wizard/             # interactive wizard (GroupSelect, ModuleSelect, Confirmation, GithubConfig)
    lib/                # theme, types, runner, modules, platform detection,
                        # args, selection, profiles, jsonConfig, elevate, homebrew
  modules/              # shell modules executed by the v2 binary
                        # (packaged into modules.tar.gz on release)
assets/
  logo.svg              # brand mark (dark background)
  logo-light.svg        # brand mark (light background variant)
install.sh              # curl-pipe installer
```

## License

[MIT](LICENSE)
