# devlair

Set up your dev lair from scratch — a CLI for Ubuntu machines.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash
```

## Usage

```bash
sudo devlair init                    # full setup from scratch
sudo devlair init --only ssh,tmux    # run specific modules
sudo devlair doctor                  # health check
sudo devlair update                  # update all tools
sudo devlair update --self           # also update devlair itself
sudo devlair disable-password        # disable SSH password auth
devlair filesystem                   # AI-guided folder structure
```

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
- Run with `sudo` for system-level steps

## Release a new version

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds binaries for both architectures and attaches them to the release.
