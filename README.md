<div align="center">

# devlair

**One command to provision a fully configured Ubuntu development machine.**

[![Release](https://img.shields.io/github/v/release/ettoreaquino/devlair?style=flat-square)](https://github.com/ettoreaquino/devlair/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/ettoreaquino/devlair/release.yml?style=flat-square&label=build)](https://github.com/ettoreaquino/devlair/actions)
[![Platform](https://img.shields.io/badge/platform-Ubuntu_24.04-E95420?style=flat-square&logo=ubuntu&logoColor=white)](https://ubuntu.com)
[![Arch](https://img.shields.io/badge/arch-x86__64_%7C_aarch64-blue?style=flat-square)](https://github.com/ettoreaquino/devlair/releases/latest)
[![License](https://img.shields.io/github/license/ettoreaquino/devlair?style=flat-square)](LICENSE)

devlair automates the setup of a fresh Ubuntu server or workstation — installing tools,
hardening security, configuring shell and terminal with the [Dracula](https://draculatheme.com) theme,
and wiring up dev toolchains. Run it once on a fresh machine or re-run anytime to converge.

</div>

---

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
devlair init
```

That's it. The installer downloads a prebuilt binary for your architecture and places it in `/usr/local/bin`. `devlair init` takes care of the rest.

## Why devlair

<table>
<tr>
<td width="33%" valign="top">

**Idempotent**

Run it once or a hundred times — devlair always converges to the desired state. Re-run after a failure, on a new machine, or just to update your config.

</td>
<td width="33%" valign="top">

**Security-first**

SSH hardening, UFW firewall, Fail2Ban, and Tailscale VPN are set up out of the box. Disable password auth with a single command when you're ready.

</td>
<td width="33%" valign="top">

**Composable**

14 modules you can run individually with `--only` or skip with `--skip`. Each module is self-contained and does one thing well.

</td>
</tr>
</table>

## Usage

```bash
# Full setup from scratch
devlair init

# Run specific modules only
devlair init --only ssh,tmux

# Skip specific modules
devlair init --skip devtools,gnome_terminal

# Check system health
devlair doctor

# Diagnose and auto-fix config drift
devlair doctor --fix

# Upgrade all tools + re-apply configs + update devlair itself
devlair upgrade

# Upgrade tools only (skip devlair binary update)
devlair upgrade --no-self

# Disable SSH password auth (key-only)
devlair disable-password

# AI-guided folder structure (requires Claude CLI)
devlair filesystem

# Claude Code usage dashboard
devlair claude

# Set your Claude Max plan tier
devlair claude --plan max5x

# Show Telegram channel configuration
devlair claude --channels

# Show configured cloud syncs and timer status
devlair sync

# Configure a new cloud folder sync (interactive — prompts for name, remote, local path)
devlair sync --add

# Configure with a preset name
devlair sync --add --name store

# Run all syncs immediately
devlair sync --now

# Remove a configured sync (interactive)
devlair sync --remove

# Remove a specific sync by name
devlair sync --remove --name store

# PicoCLAW — WhatsApp AI agent status
devlair claw

# Pair WhatsApp via QR code
devlair claw --pair

# Authorize a phone number
devlair claw --allow +5511999999999

# Revoke a phone number
devlair claw --revoke +5511999999999

# Start/stop the agent stack
devlair claw --start
devlair claw --stop

# Tail agent logs
devlair claw --logs
```

Commands that need root automatically elevate with `sudo`.

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

`devlair init` runs these modules in order:

<details>
<summary><b>System</b> — OS packages and essentials</summary>

Runs `apt update && upgrade` and installs core packages: `git`, `curl`, `vim`, `htop`, `tmux`, `zsh`, `bat`, `fzf`, `build-essential`, `ufw`, `fail2ban`, and more.

</details>

<details>
<summary><b>Timezone</b> — interactive timezone configuration</summary>

Displays the current timezone and prompts for a new one. Uses `timedatectl` under the hood.

</details>

<details>
<summary><b>Tailscale</b> — VPN for secure remote access</summary>

Installs [Tailscale](https://tailscale.com) and walks you through browser-based authentication. Your Tailscale IP is used to restrict SSH access.

</details>

<details>
<summary><b>SSH</b> — hardened configuration + key setup</summary>

Creates `/etc/ssh/sshd_config.d/99-hardened.conf` with:
- Root login disabled
- Public key auth enabled
- Max 3 auth attempts
- ListenAddress restricted to Tailscale IP (when available)

Prompts for your SSH public key if `authorized_keys` is empty.

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

Writes `~/.tmux.conf` with Dracula colors, `C-a` prefix, mouse support, 50k line history, and intuitive split bindings (`|` and `-`). Vi copy-mode with mouse drag selection piped to the system clipboard (`wl-copy` on Wayland, `xclip` on X11, OSC 52 fallback). Installs `wl-clipboard` automatically when no clipboard tool is found. Includes [TPM](https://github.com/tmux-plugins/tpm), [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) + [tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) for automatic session save/restore — TPM plugins are installed non-interactively during init/upgrade. Claude Code popup on `C-a y`.

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
| [rclone](https://rclone.org/) | Cloud storage sync |

</details>

<details>
<summary><b>rclone bisync</b> — bidirectional cloud sync via systemd timer</summary>

rclone is installed during init. Run `devlair sync --add` after setup to configure a sync:
- Prompts for a short sync name (e.g. `store`, `vault`) used as the systemd unit identifier
- Walks through `rclone config` for OAuth (Google Drive, S3, and [70+ providers](https://rclone.org/overview/))
- Creates a named systemd user timer (`rclone-<name>.timer`) that bisyncs every 5 minutes
- Runs an initial `bisync --resync` to bootstrap state immediately after setup

`devlair sync` shows timer status and last run time per configured sync. `devlair sync --remove` stops and deletes a sync's systemd units and log file (does not touch the rclone remote or local files). The login banner automatically shows synced drives when service files are present. `devlair upgrade` keeps rclone up to date and reports timer health.

</details>

<details>
<summary><b>GitHub</b> — SSH key + git config</summary>

Generates an `ed25519` SSH key for GitHub, configures `~/.ssh/config`, tests the connection, and sets `git` user/email globally.

</details>

<details>
<summary><b>Shell</b> — aliases + login banner</summary>

Appends aliases to `.zshrc` (`ll`, `..`, `ports`, `dps`, `t` for tmux, `tmx <name>` to attach sessions, `bcat` → `bat`, etc.) and a styled login banner:

```
╭─ myhost ──────────────────────────────────────╮
│  100.64.0.1  disk 3.2G/50G  mem 8.1G/15G     │
│                                               │
│  tmux:                                        │
│    dev                       → tmx dev        │
│    work                      → tmx work       │
╰───────────────────────────────────────────────╯
```

Shows hostname, Tailscale IP, disk/memory usage, and live tmux sessions with `tmx` shortcut.

</details>

<details>
<summary><b>GNOME Terminal</b> — Dracula color scheme</summary>

Applies the full 16-color Dracula palette to your default GNOME Terminal profile.

</details>

<details>
<summary><b>Claude Code</b> — hooks, settings, channels, and status bar</summary>

Merges devlair-managed keys into `~/.claude/settings.json` (model, effort level, session hooks, channels). Enables Claude Code [channels](https://docs.anthropic.com/en/docs/claude-code/channels) with the Telegram plugin — deploys a `claude-telegram.sh` wrapper to launch sessions with Telegram attached. The tmux status bar shows the active model and channel count (`CC:sonnet CH:1`), and the login banner displays channel status. Use `devlair claude --channels` to view configuration and a quick-start guide.

</details>

<details>
<summary><b>PicoCLAW</b> — WhatsApp AI agent via Evolution API</summary>

Provisions a two-container stack: [Evolution API](https://github.com/EvolutionAPI/evolution-api) (WhatsApp gateway) and PicoCLAW (a lightweight webhook-to-Claude bridge built from source during provisioning). The agent receives WhatsApp messages, calls Claude, and replies — with per-sender rate limiting, conversation history, and a phone number allowlist.

- `devlair claw` shows progressive status — walks you through setup step by step
- `devlair claw --pair` connects WhatsApp via QR code
- `devlair claw --allow +55…` manages the sender allowlist
- `devlair doctor` checks container security (non-root, read-only rootfs, cap_drop ALL, no docker socket)
- Login banner shows a compact `claw: ● up  N phones` line when provisioned

</details>

## Health check

```bash
devlair doctor
```

Verifies every component without making changes — checks installed tools, config files, service status, and SSH connectivity. Useful after setup or to audit an existing machine.

Use `--fix` to automatically re-apply configurations and install missing dev tools for modules with detected drift:

```bash
devlair doctor --fix
```

## Upgrading

```bash
devlair upgrade
```

Upgrades system packages, Docker, GitHub CLI, AWS CLI, rclone, pyenv/Python, nvm/Node, and the devlair binary itself. After version bumps, automatically re-applies module configurations (hooks, settings, shell aliases) so new config shapes take effect immediately. Reports rclone sync timer health (active state + last run) after upgrading. Use `--no-self` to skip the binary update.

## Requirements

- **OS:** Ubuntu 24.04 LTS
- **Arch:** x86_64 or aarch64
- **Privileges:** root or a user with `sudo`

## Development

```bash
git clone git@github.com:ettoreaquino/devlair.git
cd devlair
uv sync --group dev
uv run pytest tests/unit/
```

### Releasing

Tag and push — GitHub Actions builds binaries for both architectures and creates a release:

```bash
git tag v0.7.0
git push origin v0.7.0
```

### Project structure

```
devlair/
  cli.py               # Typer CLI entrypoint
  runner.py             # subprocess helpers
  context.py            # shared types, user resolution, JSON config helpers
  console.py            # Rich console + Dracula color tokens
  modules/              # one file per init module (14 modules)
  features/             # doctor, upgrade, disable-password, filesystem, claude, sync, claw
install.sh              # curl-pipe installer
```

## License

[MIT](LICENSE)
