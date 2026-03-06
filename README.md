# devlair

Set up your dev lair from scratch — a CLI for Ubuntu machines.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | sudo bash
```

## Usage

```bash
devlair init                    # full setup from scratch
devlair init --only ssh,tmux    # run specific modules
devlair doctor                  # health check
devlair update                  # update all tools
devlair update --self           # also update devlair itself
devlair disable-password        # disable SSH password auth
devlair filesystem              # AI-guided folder structure
```

Commands that need root privileges will automatically elevate with `sudo`.

## What `init` sets up

| Step | What happens |
|---|---|
| system | apt update/upgrade + essentials |
| timezone | set system timezone |
| tailscale | install and connect |
| ssh | harden sshd, add public key |
| firewall | ufw + fail2ban |
| zsh | zsh + zimfw + Dracula theme |
| tmux | tmux with Dracula palette |
| devtools | uv, pyenv, nvm, fzf, docker, gh, aws |
| github | SSH key generation + git config |
| shell | aliases and login banner in .zshrc |

## Requirements

- Ubuntu 24.04 LTS (x86_64 or aarch64)

## Release a new version

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds binaries for both architectures and attaches them to the release.
