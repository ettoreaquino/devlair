import os
from pathlib import Path

import httpx
import typer

from devlair import __version__, runner
from devlair.console import D_PURPLE, console


def _get_username() -> str:
    from devlair.context import resolve_invoking_user

    username, _ = resolve_invoking_user()
    return username


def run_upgrade(self_update: bool = False) -> None:
    if os.geteuid() != 0:
        console.print("  [error]This command must be run as root.[/error]")
        raise typer.Exit(1)

    username = _get_username()
    user_home = Path(f"~{username}").expanduser()

    # ── System packages ───────────────────────────────────────────────────────
    with console.status("[step]apt update...[/step]", spinner="dots", spinner_style=D_PURPLE):
        runner.run("apt-get update -qq")
        runner.run("apt-get upgrade -y -qq")
        # Ensure WSL extras are present (may have been added in a newer devlair version)
        if os.environ.get("WSL_DISTRO_NAME"):
            runner.run("apt-get install -y -qq wslu", check=False)
    console.print("  [success]✓[/success]  System packages")

    # ── GitHub CLI ────────────────────────────────────────────────────────────
    if runner.cmd_exists("gh"):
        with console.status("[step]gh CLI...[/step]", spinner="dots", spinner_style=D_PURPLE):
            runner.run("apt-get install -y -qq gh", check=False)
        console.print("  [success]✓[/success]  GitHub CLI")

    # ── AWS CLI ───────────────────────────────────────────────────────────────
    if runner.cmd_exists("aws"):
        with console.status("[step]AWS CLI...[/step]", spinner="dots", spinner_style=D_PURPLE):
            arch = runner.get_output("dpkg --print-architecture")
            aws_arch = "x86_64" if arch == "amd64" else "aarch64"
            runner.run_shell(
                f"""
                curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-{aws_arch}.zip" -o /tmp/awscliv2.zip
                unzip -qo /tmp/awscliv2.zip -d /tmp
                /tmp/aws/install --update
                rm -rf /tmp/awscliv2.zip /tmp/aws
            """,
                check=False,
            )
        console.print("  [success]✓[/success]  AWS CLI")

    # ── Docker ────────────────────────────────────────────────────────────────
    if runner.cmd_exists("docker"):
        with console.status("[step]Docker...[/step]", spinner="dots", spinner_style=D_PURPLE):
            runner.run(
                "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin", check=False
            )
        console.print("  [success]✓[/success]  Docker")

    # ── pyenv / Python ─────────────────────────────────────────────────────────
    pyenv_dir = user_home / ".pyenv"
    if pyenv_dir.exists():
        with console.status("[step]pyenv + Python...[/step]", spinner="dots", spinner_style=D_PURPLE):
            runner.run_shell_as(
                username,
                f'export PYENV_ROOT="{pyenv_dir}" && export PATH="$PYENV_ROOT/bin:$PATH" '
                f'&& pyenv update && pyenv install -s 3 && pyenv global "$(pyenv latest 3)"',
                check=False,
            )
        console.print("  [success]✓[/success]  pyenv + Python")

    # ── nvm / Node ─────────────────────────────────────────────────────────────
    nvm_dir = user_home / ".nvm"
    if nvm_dir.exists():
        with console.status("[step]nvm + Node LTS...[/step]", spinner="dots", spinner_style=D_PURPLE):
            runner.run_shell_as(
                username,
                f'export NVM_DIR="{nvm_dir}" && source "$NVM_DIR/nvm.sh" && nvm install --lts',
                check=False,
            )
        console.print("  [success]✓[/success]  nvm + Node LTS")

    # ── rclone ────────────────────────────────────────────────────────────────
    if runner.cmd_exists("rclone"):
        with console.status("[step]rclone...[/step]", spinner="dots", spinner_style=D_PURPLE):
            script = runner.safe_tempfile(suffix=".sh")
            try:
                runner.run_shell(f'curl -fsSL "https://rclone.org/install.sh" -o "{script}"', check=False)
                runner.run_shell(f'bash "{script}"', check=False)
            finally:
                script.unlink(missing_ok=True)
        console.print("  [success]✓[/success]  rclone")

    # ── Bun ───────────────────────────────────────────────────────────────────
    bun_bin = user_home / ".bun" / "bin" / "bun"
    if bun_bin.exists():
        with console.status("[step]Bun...[/step]", spinner="dots", spinner_style=D_PURPLE):
            runner.run_shell_as(username, f"{bun_bin} upgrade", check=False)
        console.print("  [success]✓[/success]  Bun")

    from devlair.features.sync import discover_timers, timer_status

    for t in discover_timers(user_home):
        active, last = timer_status(username, user_home, t.name)
        style = "success" if active == "active" else "warning"
        console.print(
            f"       [muted]{t.stem.removeprefix('rclone-')}[/muted]  "
            f"[{style}]{active}[/{style}]  ·  last: [muted]{last}[/muted]"
        )

    # ── Self-update ───────────────────────────────────────────────────────────
    if self_update:
        _self_update()

    console.print()
    console.print("  [success]Update complete.[/success]")
    console.print()


_INSTALL_DIR = Path("/usr/local/bin")


def _find_install_path() -> Path:
    """Determine where to install the devlair binary.

    Prefers /usr/local/bin.  Falls back to an existing standalone binary
    found on $PATH (skipping pip console scripts that point at a Python
    interpreter via their shebang).
    """
    import shutil

    target = _INSTALL_DIR / "devlair"
    if target.exists():
        return target

    which = shutil.which("devlair")
    if which:
        candidate = Path(which).resolve()
        # Avoid overwriting a pip console script (text file with a Python shebang)
        if candidate.stat().st_size > 1_000_000:  # PyInstaller binaries are large
            return candidate

    # Default to /usr/local/bin even if it doesn't exist yet
    return target


def _installed_version() -> str:
    """Return the version of the installed devlair binary, or __version__ as fallback."""
    import subprocess

    install_path = _find_install_path()
    if install_path.exists():
        try:
            out = subprocess.run(
                [str(install_path), "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            # Output is "devlair X.Y.Z"
            return out.stdout.strip().split()[-1]
        except Exception:
            pass
    return __version__


def _self_update() -> None:
    current = _installed_version()

    if "dev" in current:
        console.print("  [muted]Dev install detected — skipping self-update.[/muted]")
        return

    with console.status("[step]Checking for devlair updates...[/step]", spinner="dots", spinner_style=D_PURPLE):
        try:
            resp = httpx.get(
                "https://api.github.com/repos/ettoreaquino/devlair/releases/latest",
                timeout=10,
            )
            resp.raise_for_status()
            latest = resp.json()["tag_name"].removeprefix("v")
        except Exception as exc:
            console.print(f"  [warning]Could not check for updates: {exc}[/warning]")
            return

    if latest == current:
        console.print(f"  [muted]devlair {current} is already up to date.[/muted]")
        return

    console.print(f"  New version available: [accent]{latest}[/accent] (current: [muted]{current}[/muted])")
    if not typer.confirm("  Update now?", default=True):
        return

    import platform

    arch = platform.machine()
    suffix = "linux-x86_64" if arch == "x86_64" else "linux-aarch64"
    url = f"https://github.com/ettoreaquino/devlair/releases/download/v{latest}/devlair-{suffix}"

    install_path = _find_install_path()

    with console.status(f"[step]Downloading v{latest}...[/step]", spinner="dots", spinner_style=D_PURPLE):
        resp = httpx.get(url, follow_redirects=True, timeout=60)
        resp.raise_for_status()
        tmp = runner.safe_tempfile()
        tmp.write_bytes(resp.content)
        tmp.chmod(0o755)
        tmp.replace(install_path)
        install_path.chmod(0o755)

    console.print(f"  [success]✓[/success]  devlair updated to v{latest} at {install_path} — restart to apply")
