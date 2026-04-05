import shutil
from pathlib import Path

import typer

from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext

LABEL = "SSH"
SSHD_CONF = Path("/etc/ssh/sshd_config.d/99-hardened.conf")


def run(ctx: SetupContext) -> ModuleResult:
    # Back up existing config
    orig = Path("/etc/ssh/sshd_config")
    if orig.exists():
        shutil.copy(orig, orig.with_suffix(".bak"))

    ts_ip = runner.get_output("tailscale ip -4")
    listen = f"ListenAddress {ts_ip}" if ts_ip else "# ListenAddress <set after tailscale connects>"

    SSHD_CONF.parent.mkdir(parents=True, exist_ok=True)
    SSHD_CONF.write_text(f"""{listen}
Port 22
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers {ctx.username}
""")

    # SSH key directory
    ssh_dir = ctx.user_home / ".ssh"
    ssh_dir.mkdir(mode=0o700, exist_ok=True)
    auth_keys = ssh_dir / "authorized_keys"
    auth_keys.touch(mode=0o600, exist_ok=True)
    shutil.chown(ssh_dir, ctx.username, ctx.username)
    shutil.chown(auth_keys, ctx.username, ctx.username)

    # Prompt for public key if empty
    if auth_keys.stat().st_size == 0:
        console.print("\n  [info]Paste your SSH public key to enable key-based login.[/info]")
        pub_key = typer.prompt("  Public key (or Enter to skip)", default="")
        if pub_key:
            if any(pub_key.startswith(p) for p in ("ssh-ed25519", "ssh-rsa", "ecdsa-sha2-", "sk-")):
                with auth_keys.open("a") as f:
                    f.write(pub_key + "\n")
                shutil.chown(auth_keys, ctx.username, ctx.username)
            else:
                return ModuleResult(status="warn", detail="key skipped — does not look like a valid SSH public key")

    runner.run("systemctl restart ssh", check=False)
    detail = f"locked to {ts_ip}" if ts_ip else "open on all interfaces (set ListenAddress after Tailscale)"
    return ModuleResult(status="ok", detail=detail)


def check() -> list[CheckItem]:
    items = []
    items.append(
        CheckItem(
            label="sshd running",
            status="ok" if runner.get_output("systemctl is-active ssh") == "active" else "fail",
        )
    )
    items.append(
        CheckItem(
            label="99-hardened.conf",
            status="ok" if SSHD_CONF.exists() else "warn",
            detail="present" if SSHD_CONF.exists() else "missing",
        )
    )
    return items
