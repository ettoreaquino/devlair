import os
import sys
from pathlib import Path

import typer

from devlair.console import console
from devlair import runner

SSHD_CONF = Path("/etc/ssh/sshd_config.d/99-hardened.conf")


def run_disable_password() -> None:
    if os.geteuid() != 0:
        console.print("[muted]Elevating to root...[/muted]")
        os.execvp("sudo", ["sudo"] + sys.argv)

    # Find authorized_keys — check common locations
    sudo_user = os.environ.get("SUDO_USER", "")
    if not sudo_user or sudo_user == "root":
        sudo_user = typer.prompt("Username to check")

    import pwd
    user_home = Path(pwd.getpwnam(sudo_user).pw_dir)
    auth_keys = user_home / ".ssh" / "authorized_keys"

    # Verify at least one key exists
    if not auth_keys.exists() or auth_keys.stat().st_size == 0:
        console.print()
        console.print("  [error]No public key found in authorized_keys.[/error]")
        console.print(f"  [muted]Add a key to {auth_keys} before disabling password auth.[/muted]")
        console.print()
        raise typer.Exit(1)

    key_count = sum(
        1 for line in auth_keys.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    )
    console.print()
    console.print(f"  [success]{key_count} public key(s) found in authorized_keys.[/success]")
    console.print()
    console.print("  This will update [detail]/etc/ssh/sshd_config.d/99-hardened.conf[/detail]")
    console.print("  and set [detail]PasswordAuthentication no[/detail].")
    console.print()
    console.print("  [warning]Make sure you can log in with your SSH key before continuing.[/warning]")
    console.print()

    if not typer.confirm("  Disable SSH password authentication?", default=False):
        console.print("  Aborted.")
        return

    if not SSHD_CONF.exists():
        console.print(f"  [error]{SSHD_CONF} not found. Run 'devlair init --only ssh' first.[/error]")
        raise typer.Exit(1)

    content = SSHD_CONF.read_text()
    updated = content.replace("PasswordAuthentication yes", "PasswordAuthentication no")
    if "PasswordAuthentication no" not in updated:
        updated += "\nPasswordAuthentication no\n"
    SSHD_CONF.write_text(updated)

    runner.run("systemctl restart ssh")

    console.print()
    console.print("  [success]✓  Password authentication disabled.[/success]")
    console.print("  [muted]SSH now requires a key to log in.[/muted]")
    console.print()
