import os
import stat
import sys
import tempfile
from pathlib import Path

import httpx
import typer

from devlair import __version__
from devlair.console import console, D_PURPLE
from devlair import runner


def run_update(self_update: bool = False) -> None:
    if os.geteuid() != 0:
        console.print("[muted]Elevating to root...[/muted]")
        os.execvp("sudo", ["sudo"] + sys.argv)

    # ── System packages ───────────────────────────────────────────────────────
    with console.status("[step]apt update...[/step]", spinner="dots", spinner_style=D_PURPLE):
        runner.run("apt-get update -qq")
        runner.run("apt-get upgrade -y -qq")
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
            runner.run_shell(f"""
                curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-{aws_arch}.zip" -o /tmp/awscliv2.zip
                unzip -qo /tmp/awscliv2.zip -d /tmp
                /tmp/aws/install --update
                rm -rf /tmp/awscliv2.zip /tmp/aws
            """, check=False)
        console.print("  [success]✓[/success]  AWS CLI")

    # ── Docker ────────────────────────────────────────────────────────────────
    if runner.cmd_exists("docker"):
        with console.status("[step]Docker...[/step]", spinner="dots", spinner_style=D_PURPLE):
            runner.run("apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin", check=False)
        console.print("  [success]✓[/success]  Docker")

    # ── Self-update ───────────────────────────────────────────────────────────
    if self_update:
        _self_update()

    console.print()
    console.print("  [success]Update complete.[/success]")
    console.print()


def _self_update() -> None:
    with console.status("[step]Checking for devlair updates...[/step]", spinner="dots", spinner_style=D_PURPLE):
        try:
            resp = httpx.get(
                "https://api.github.com/repos/ettoreaquino/devlair/releases/latest",
                timeout=10,
            )
            resp.raise_for_status()
            latest = resp.json()["tag_name"].lstrip("v")
        except Exception as exc:
            console.print(f"  [warning]Could not check for updates: {exc}[/warning]")
            return

    if latest == __version__:
        console.print(f"  [muted]devlair {__version__} is already up to date.[/muted]")
        return

    console.print(f"  New version available: [accent]{latest}[/accent] (current: [muted]{__version__}[/muted])")
    if not typer.confirm("  Update now?", default=True):
        return

    import platform, sys
    arch = platform.machine()
    suffix = "linux-x86_64" if arch == "x86_64" else "linux-aarch64"
    url = f"https://github.com/ettoreaquino/devlair/releases/download/v{latest}/devlair-{suffix}"

    with console.status(f"[step]Downloading v{latest}...[/step]", spinner="dots", spinner_style=D_PURPLE):
        resp = httpx.get(url, follow_redirects=True, timeout=60)
        resp.raise_for_status()
        binary = Path(sys.executable)
        tmp = Path(tempfile.mktemp())
        tmp.write_bytes(resp.content)
        tmp.chmod(tmp.stat().st_mode | stat.S_IEXEC)
        tmp.replace(binary)

    console.print(f"  [success]✓[/success]  devlair updated to v{latest} — restart to apply")
