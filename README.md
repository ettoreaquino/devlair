<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
  <img alt="devlair" src="assets/logo.svg" width="480">
</picture>

**One command to provision a fully configured Ubuntu, WSL, or macOS development machine.**

[![Release](https://img.shields.io/github/v/release/ettoreaquino/devlair?style=flat-square)](https://github.com/ettoreaquino/devlair/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/ettoreaquino/devlair/ci-v2.yml?style=flat-square&label=CI)](https://github.com/ettoreaquino/devlair/actions)
[![Platform](https://img.shields.io/badge/platform-Ubuntu%20%7C%20WSL%20%7C%20macOS-E95420?style=flat-square&logo=ubuntu&logoColor=white)](https://ubuntu.com)
[![License](https://img.shields.io/github/license/ettoreaquino/devlair?style=flat-square)](LICENSE)

</div>

---

devlair automates the setup of a fresh Ubuntu server, workstation, WSL instance, or macOS machine — installing tools,
hardening security, configuring shell and terminal with the [Dracula](https://draculatheme.com) theme,
and wiring up dev toolchains. Run it once on a fresh machine or re-run anytime to converge.

## Quick start

**1. Install the binary**

```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash
```

The installer downloads the `devlair` binary to `/usr/local/bin` and auto-elevates with `sudo` when that path is not writable — so the same command works on macOS, Linux, and WSL.

**2. Provision the machine**

```bash
devlair init
```

`devlair init` launches an interactive wizard that walks you through group and module selection, then converges the machine to the desired state.

**Common options**

```bash
devlair init --group core,coding      # run only specific module groups
devlair init --only ssh,tmux          # run individual modules (deps auto-added)
devlair init --skip gnome_terminal    # exclude modules from a run
devlair init --config setup.yaml      # drive selection from a YAML profile

# White-label the login banner and wizard for your team/company:
devlair init --brand "acme"           # banner reads "a c m e" instead of "devlair"
```

`--brand` is persisted to `~/.devlair/brand` and reused automatically on every subsequent run and login.

## Why devlair

<table>
<tr>
<td width="33%" valign="top">

**Idempotent**

Run it once or a hundred times — devlair always converges to the desired state. Re-run after a failure, on a new machine, or just to update your config.

</td>
<td width="33%" valign="top">

**Security-first**

SSH hardening, UFW firewall, Fail2Ban, and Tailscale VPN are set up out of the box on Linux. On WSL and macOS, modules that require `systemctl` are auto-skipped. Disable password auth with a single command when you're ready.

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
    init [--only MOD] [--skip MOD] [--group GRP] [--config FILE] [--brand NAME]  Set up this machine from scratch
    doctor [--fix]                          Check system health & fix drift
    upgrade [--no-self]                     Upgrade tools & re-apply configs
    disable-password [--yes]                Lock SSH to key-only auth
    uninstall [--yes] [--purge]             Remove everything devlair installed
      [--keep-packages] [--force]

  AI Agents
    claude [--plan TIER] [--1m on|off]      Status & config

  tmux Sessions
    t                                       Start/attach default 'dev' session
    tmx <name>                              Attach to a named session
    tmx new --name N                        Create a plain session
    tmx new --name N --claude               Session with Claude Code
    Ctrl+A  y                               Claude Code popup (any session)

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

# White-label the brand on the login banner + wizard
devlair init --brand "acme"

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
```

</details>

## Claude Code integration

The opt-in `claude` module installs Claude Code and merges devlair-managed keys into `~/.claude/settings.json` (model, effort level). The `devlair claude` command shows a short status panel and configures your plan and context window:

```
devlair  claude  max5x

  plan   max5x
  model  sonnet
```

- `devlair claude` — show the current plan and model
- `devlair claude --plan pro|max5x|max20x` — set your subscription tier
- `devlair claude --1m on|off` — toggle 1M-token context (sets `opus[1m]` / `sonnet`)

> A full usage dashboard (budget bars, cost tracking) is not part of devlair.

## What gets installed

`devlair init` runs a set of modules in dependency order. Most run by default; a few are **opt-in** (enable with `devlair init --only <module>` or `--group`). Module availability and defaults vary by platform:

| Module | Linux | WSL | macOS |
|--------|:-----:|:---:|:-----:|
| `homebrew` — Homebrew bootstrap | — | — | ✓ |
| `system` — OS packages & essentials | ✓ | ✓ | ✓ |
| `timezone` — IANA timezone | ✓ | — | — |
| `tailscale` — VPN | ✓ | ○ | ○ |
| `ssh` — hardened SSH server | ✓ | — | — |
| `firewall` — UFW + Fail2Ban | ✓ | — | — |
| `zsh` — shell + Dracula prompt | ✓ | ✓ | ✓ |
| `tmux` — Dracula multiplexer | ✓ | ✓ | ✓ |
| `devtools` — dev toolchain | ✓ | ✓ | ✓ |
| `github` — SSH key + git config | ✓ | ✓ | ✓ |
| `shell` — aliases + login banner | ✓ | ✓ | ✓ |
| `gnome_terminal` — Dracula palette | ✓ | — | — |
| `claude` — Claude Code | ○ | ○ | ○ |

Legend: ✓ runs by default · ○ available, opt-in (`--only`) · — not applicable

### On Linux / WSL

Packages install via `apt`. Core essentials (`git`, `curl`, `vim`, `htop`, `tmux`, `zsh`, `bat`, `fzf`, `build-essential`, `jq`, and more) are installed on every Linux/WSL run. On bare Linux, `system` also installs `openssh-server`, `ufw`, `fail2ban`, and `avahi-daemon`, and the dedicated `ssh`, `firewall`, `timezone`, and `gnome_terminal` modules run. On **WSL** these systemd-dependent modules are auto-skipped (and `wslu` is installed so `wslview` can open your Windows browser). Docker installs via apt on bare Linux; on WSL it expects Docker Desktop for Windows with WSL integration enabled.

### On macOS

Before the wizard UI starts, a pre-flight verifies you're a local admin and installs Homebrew if it's missing — running Homebrew's official installer interactively (it prompts for your password over the terminal). This is the single point of Homebrew installation; all packages then install via `brew`. Linux-only modules (`timezone`, `ssh`, `firewall`, `gnome_terminal`) are skipped. In `devtools`, `uv`, `pyenv`, `fzf`, `gh`, `aws`, and `bun` install via `brew` (with pyenv's build deps), while `nvm` uses its official install script. **Docker is not installed** — the module prints guidance to install Docker Desktop for Mac and continues without error.

<details>
<summary><b>Homebrew</b> — package-manager bootstrap (macOS)</summary>

macOS-only. Before the wizard UI starts, a pre-flight (`macOsPreFlight()`) checks that the user is a local admin (exiting with guidance if not) and requires an interactive terminal. If Homebrew is missing it runs Homebrew's official installer interactively — Homebrew prompts for your password over the real TTY. This is the single point of Homebrew installation; the `homebrew` module step itself just confirms `brew` is on `PATH`. `homebrew` is a dependency of `system`, `zsh`, `tmux`, and `devtools` on macOS.

</details>

<details>
<summary><b>System</b> — OS packages and essentials</summary>

On Linux/WSL, runs `apt update && upgrade` and installs core packages: `curl`, `wget`, `git`, `vim`, `htop`, `tmux`, `unzip`, `net-tools`, `build-essential`, `ca-certificates`, `gnupg`, `jq`, `tree`, `rsync`, `zsh`, `bat`, `fzf`, `locales`. On bare Linux it also installs `openssh-server`, `ufw`, `fail2ban`, and `avahi-daemon`; these are skipped on WSL because they ship systemd-managed postinst scripts that don't work under WSL's systemd-less default (the dedicated `ssh` and `firewall` modules are also Linux-only). WSL additionally gets `wslu`. On macOS the module runs `brew update && brew upgrade` and installs the macOS essentials via `brew install` (`git`, `curl`, `wget`, `vim`, `htop`, `tmux`, `unzip`, `jq`, `tree`, `rsync`, `zsh`, `bat`, `fzf`, `gnupg`).

</details>

<details>
<summary><b>Timezone</b> — interactive timezone configuration</summary>

Displays the current timezone and prompts for a new one. Uses `timedatectl set-timezone`. The configured timezone is IANA-validated before being applied; the health check reports `fail` when the timezone cannot be read. Linux-only — auto-skipped on WSL and macOS.

</details>

<details>
<summary><b>Tailscale</b> — VPN for secure remote access</summary>

Installs [Tailscale](https://tailscale.com) and walks you through browser-based authentication. On Linux your Tailscale IP is used to restrict SSH access. Runs by default on Linux; **opt-in on WSL and macOS** (`--only tailscale`). During the browser flow, press **Enter** to skip waiting and verify later with `devlair doctor`.

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

Resets and configures UFW (default deny incoming, allow outgoing). Sets up Fail2Ban with 1-hour ban times and 3 max retries. Linux-only — auto-skipped on macOS and WSL.

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
<summary><b>Dev tools</b> — language toolchains and CLIs</summary>

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
| [Bun](https://bun.sh/) | JavaScript runtime |

On Linux/WSL these install via apt/curl/git (AWS CLI v2 is GPG-verified). On macOS, `uv`, `pyenv`, `fzf`, `gh`, `aws`, and `bun` install via `brew` (plus pyenv's build deps), while `nvm` uses its official install script. **Docker is not installed on WSL or macOS** — the module prints guidance to install Docker Desktop and continues without error.

</details>

<details>
<summary><b>GitHub</b> — SSH key + git config</summary>

Generates an `ed25519` SSH key for GitHub, configures `~/.ssh/config`, tests the connection, and sets `git` user/email globally. The wizard collects `github_email` (required, regex-validated) and `github_name` (optional) before execution; in non-interactive mode (`--config`) `github_email` must be supplied via `config.github_email` in the profile YAML. During the SSH-authentication check, devlair auto-detects a successful `ssh -T git@github.com` handshake — press **Enter** to skip the wait and verify later with `devlair doctor`.

</details>

<details>
<summary><b>Shell</b> — aliases + login banner</summary>

Appends aliases to `.zshrc` and a `tmx` command for session management. Aliases are platform-aware: `ll`, `ports`, and `update` expand differently on macOS (`ls -G`, `lsof`, `brew`) vs Linux/WSL (`ls --color`, `ss`, `apt`). The `BROWSER` env var is set to `wslview` on WSL. The login banner title defaults to `devlair` but reflects the `--brand NAME` value when one is set (persisted to `~/.devlair/brand` and reused automatically on subsequent runs). The banner shows live tmux sessions:

```
╭─ myhost ──────────────────────────────────────╮
│  100.64.0.1  disk 3.2G/50G  mem 8.1G/15G     │
│                                               │
│  tmux:                                        │
│    dev                       → tmx dev        │
│    work                      → tmx work       │
╰───────────────────────────────────────────────╯
```

</details>

<details>
<summary><b>GNOME Terminal</b> — Dracula color scheme</summary>

Applies the full 16-color Dracula palette to your default GNOME Terminal profile. Linux-only — auto-skipped on WSL and macOS.

</details>

<details>
<summary><b>Claude Code</b> — install + settings</summary>

Always opt-in (`--only claude`). Installs Claude Code (if absent) and merges devlair-managed keys into `~/.claude/settings.json` (model, effort level). Deploys the `tmx-new` helper for launching named tmux sessions (`tmx new --name <n> [--claude]`). Use `devlair claude` to view the current plan/model, `--plan TIER` to set the subscription tier, and `--1m on|off` to toggle 1M-token context.

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

Checks for a new devlair binary first — if a newer release is available, it downloads, replaces, and re-execs so the rest of the upgrade runs new code. Then upgrades system packages and any tools that were installed during init (Docker, GitHub CLI, AWS CLI, pyenv/Python, nvm/Node, Bun). After upgrading, automatically re-applies module configurations (hooks, settings, shell aliases) so new config shapes take effect immediately. Use `--no-self` to skip the binary update.

## Uninstall

```bash
devlair uninstall
```

Runs each module's reverse step in reverse dependency order — removes installed tools (pyenv, nvm, bun, fzf, uv, and with default package removal: docker, gh, aws, tailscale, tmux, ufw/fail2ban), reverts system state (firewall, sshd hardening, default shell back to the recorded original, docker group, GNOME Terminal profile), strips devlair config blocks, and removes the binary + `~/.devlair/`. Sensitive items (GitHub SSH key, git identity, `~/.ssh/authorized_keys`, Tailscale auth) are kept by default and you're asked per-category whether to destroy each. Never purges `openssh-server` (lockout-safe). Plain uninstall leaves Homebrew untouched; on macOS `--purge` removes Homebrew too — **last**, after the modules have used it to uninstall their packages, and only after you confirm (it's listed in the confirmation as "removed last"). Because uninstall is destructive, **every interactive run — including `--purge` — shows a confirmation that lists what will be removed** (modules reverted, core files, packages, sensitive choices, and Homebrew when applicable) before doing anything. On macOS (except with `--force`) you're prompted for your password up front so the root-owned binary and share dir can be removed. Flags: `--yes` preselects "keep" for sensitive items (skips the per-category prompts), `--purge` preselects "destroy" for them all, `--keep-packages` skips apt/brew package removal, `--force` skips the final confirmation for fully non-interactive use (scripts/CI) — on macOS root-owned artifacts may be skipped if sudo credentials are not already cached, and a warning is emitted to stderr. Auto-elevates via sudo on Linux.

## Requirements

- **OS:** Ubuntu 24.04 LTS, WSL 2 (Ubuntu), or macOS 13+ (Apple Silicon or Intel)
- **Arch:** x86_64 or aarch64
- **Privileges:** root or a user with `sudo` on Linux; a local admin account on macOS
- **Docker:** Docker Desktop required on WSL and macOS for Docker-dependent workflows (not installed by devlair on those platforms)

## Development

devlair is a TypeScript + [Ink](https://github.com/vadimdemedes/ink) CLI compiled to a standalone binary with [Bun](https://bun.sh). No runtime dependencies on the target machine.

```bash
git clone git@github.com:ettoreaquino/devlair.git
cd devlair/cli
bun install
bun run dev          # run in development
bun run typecheck    # tsc --noEmit
bun run lint         # biome check
bun run compile      # standalone binary → dist/devlair
```

Open the repo in your editor of choice. devlair does not install VS Code or define a `code` alias — the `code` command comes from VS Code's own shell integration (on macOS, "Shell Command: Install 'code' command in PATH"; on Linux it ships with the apt/snap package).

### Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please). Conventional Commits on `main` determine version bumps (`fix:` → patch, `feat:` → minor, `feat!:` → major). Release-please maintains a "Release PR" with the changelog; merging it triggers a GitHub Release and binary builds for both architectures. **Never tag manually.**

### Project structure

```
cli/                    # TypeScript CLI
  src/
    index.tsx           # Ink app entrypoint (+ macOS pre-flight)
    commands/           # init, doctor, upgrade, claude, disable-password, uninstall
    components/         # Ink UI components (Logo, Help, Progress, Summary)
    wizard/             # interactive wizard (GroupSelect, ModuleSelect, Confirmation, GithubConfig)
    lib/                # theme, types, runner, modules, platform detection,
                        # args, selection, profiles, jsonConfig, elevate, homebrew, brand
  modules/              # shell modules executed by the binary
                        # (packaged into modules.tar.gz on release)
assets/
  logo.svg              # brand mark (dark background)
  logo-light.svg        # brand mark (light background variant)
install.sh              # curl-pipe installer
```

## License

[MIT](LICENSE)
</content>
</invoke>
