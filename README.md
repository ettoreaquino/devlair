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

<!-- TODO: Add a terminal recording GIF here (e.g. using vhs or asciinema) -->
<!-- <p align="center"><img src="assets/demo.gif" width="700" alt="devlair demo"></p> -->

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

11 modules you can run individually with `--only` or skip with `--skip`. Each module is self-contained and does one thing well.

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

# Update all tools + devlair itself
devlair update

# Update tools only (skip devlair binary update)
devlair update --no-self

# Disable SSH password auth (key-only)
devlair disable-password

# AI-guided folder structure (requires Claude CLI)
devlair filesystem
```

Commands that need root automatically elevate with `sudo`.

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

Writes `~/.tmux.conf` with Dracula colors, `C-a` prefix, mouse support, 50k line history, and intuitive split bindings (`|` and `-`).

</details>

<details>
<summary><b>Dev tools</b> — 7 essential tools</summary>

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

</details>

<details>
<summary><b>GitHub</b> — SSH key + git config</summary>

Generates an `ed25519` SSH key for GitHub, configures `~/.ssh/config`, tests the connection, and sets `git` user/email globally.

</details>

<details>
<summary><b>Shell</b> — aliases + login banner</summary>

Appends aliases to `.zshrc` (`ll`, `..`, `ports`, `dps`, `t` for tmux, `cat` → `bat`, etc.) and a login banner showing hostname, Tailscale IP, disk, and memory usage.

</details>

<details>
<summary><b>GNOME Terminal</b> — Dracula color scheme</summary>

Applies the full 16-color Dracula palette to your default GNOME Terminal profile.

</details>

## Health check

```bash
devlair doctor
```

Verifies every component without making changes — checks installed tools, config files, service status, and SSH connectivity. Useful after setup or to audit an existing machine.

## Updating

```bash
devlair update
```

Updates system packages, Docker, GitHub CLI, AWS CLI, and the devlair binary itself. Use `--no-self` to skip the binary update.

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
git tag v0.3.0
git push origin main --tags
```

### Project structure

```
devlair/
  cli.py               # Typer CLI entrypoint
  runner.py             # subprocess helpers
  context.py            # SetupContext, ModuleResult, CheckItem
  console.py            # Rich console + Dracula color tokens
  modules/              # one file per init module (11 modules)
  features/             # doctor, update, disable-password, filesystem
install.sh              # curl-pipe installer
```

## License

[MIT](LICENSE)
