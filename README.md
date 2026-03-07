# devlair

[![Release](https://img.shields.io/github/v/release/ettoreaquino/devlair?style=flat-square)](https://github.com/ettoreaquino/devlair/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/ettoreaquino/devlair/release.yml?style=flat-square&label=build)](https://github.com/ettoreaquino/devlair/actions)
[![Platform](https://img.shields.io/badge/platform-Ubuntu_24.04-E95420?style=flat-square&logo=ubuntu&logoColor=white)](https://ubuntu.com)
[![Arch](https://img.shields.io/badge/arch-x86__64_%7C_aarch64-blue?style=flat-square)](https://github.com/ettoreaquino/devlair/releases/latest)

**One command to provision a fully configured Ubuntu development machine.**

devlair is a CLI tool that automates the setup of a fresh Ubuntu server or workstation — installing tools, hardening security, configuring shell and terminal themes, and wiring up dev toolchains. It is idempotent: run it once on a fresh machine or re-run it anytime to converge to the desired state.

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
devlair init
```

The installer downloads a prebuilt binary for your architecture (`x86_64` or `aarch64`) from the latest GitHub release.

## Commands

| Command | Description |
|---|---|
| `devlair init` | Full setup from scratch |
| `devlair init --only ssh,tmux` | Run specific modules only |
| `devlair init --skip devtools` | Skip specific modules |
| `devlair doctor` | Health check — verify all components |
| `devlair update` | Update all installed tools |
| `devlair update --self` | Also update the devlair binary |
| `devlair disable-password` | Disable SSH password auth (key-only) |
| `devlair filesystem` | AI-guided folder structure setup |

Commands that need root automatically elevate with `sudo`.

## Modules

`devlair init` runs these modules in order:

| Module | What it does |
|---|---|
| **system** | `apt update && upgrade`, install essential packages |
| **timezone** | Set system timezone interactively |
| **tailscale** | Install and authenticate Tailscale VPN |
| **ssh** | Harden `sshd_config`, deploy public key |
| **firewall** | Configure `ufw` rules + install `fail2ban` |
| **zsh** | Install zsh, set as default shell, configure [zimfw](https://zimfw.sh) with [Dracula](https://draculatheme.com) theme |
| **tmux** | Install tmux with Dracula color palette |
| **devtools** | Install [uv](https://docs.astral.sh/uv/), [pyenv](https://github.com/pyenv/pyenv), [nvm](https://github.com/nvm-sh/nvm), [fzf](https://github.com/junegunn/fzf), Docker, `gh`, AWS CLI |
| **github** | Generate SSH key pair, configure `git` user/email |
| **shell** | Aliases, pyenv/nvm/fzf init, login banner in `.zshrc` |
| **gnome_terminal** | Apply Dracula color scheme to GNOME Terminal |

Each module is idempotent — safe to re-run. Use `--only` to retry a single module after a failure.

## Requirements

- **OS:** Ubuntu 24.04 LTS
- **Arch:** x86_64 or aarch64
- **Privileges:** root (or a user with `sudo`)

## Project structure

```
devlair/
  cli.py              # Typer CLI entrypoint
  runner.py            # subprocess helpers (run, run_as, run_shell_as)
  context.py           # SetupContext, ModuleResult, CheckItem
  console.py           # Rich console + Dracula color tokens
  modules/             # one file per init module
  features/            # doctor, update, disable-password, filesystem
install.sh             # curl-pipe installer
```

## Development

```bash
git clone git@github.com:ettoreaquino/devlair.git
cd devlair
uv sync --group dev
uv run pytest tests/unit/
```

### Releasing

Tag a version and push — GitHub Actions builds binaries for both architectures and creates a release:

```bash
git tag v0.3.0
git push origin main --tags
```

## How it works

devlair is a single static binary built with [PyInstaller](https://pyinstaller.org). The `init` command iterates over a module registry, calling each module's `run(ctx)` function with a `SetupContext` (username, home directory). Modules use shell runners from `runner.py` to execute system commands, handling privilege escalation transparently. The `doctor` command calls each module's `check()` function to verify the current state without making changes.

## License

MIT
