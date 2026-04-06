import shutil
from pathlib import Path

import typer

from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext

LABEL = "GitHub SSH key"


def run(ctx: SetupContext) -> ModuleResult:
    gh_key = ctx.user_home / ".ssh" / "id_ed25519_github"
    ssh_conf = ctx.user_home / ".ssh" / "config"

    if gh_key.exists():
        return ModuleResult(status="skip", detail="key already exists")

    email = typer.prompt("\n  GitHub email (or Enter to skip)", default="")
    if not email:
        return ModuleResult(status="skip", detail="skipped")

    # Generate key as the user
    runner.run_as(
        ctx.username,
        ["ssh-keygen", "-t", "ed25519", "-C", email, "-f", str(gh_key), "-N", ""],
    )

    # SSH config entry (idempotent)
    conf_text = ssh_conf.read_text() if ssh_conf.exists() else ""
    if "Host github.com" not in conf_text:
        with ssh_conf.open("a") as f:
            f.write(f"""
# GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile {gh_key}
    IdentitiesOnly yes
""")
        ssh_conf.chmod(0o600)
        shutil.chown(ssh_conf, ctx.username, ctx.username)

    pub = gh_key.with_suffix(".pub").read_text().strip()
    console.print("\n  [info]Add this public key to GitHub → Settings → SSH keys:[/info]")
    console.print(f"\n  [detail]{pub}[/detail]\n")
    typer.prompt("  Press Enter after adding the key to GitHub", default="", show_default=False)

    # Test connection
    test = runner.run_as(
        ctx.username,
        ["ssh", "-T", "git@github.com", "-o", "StrictHostKeyChecking=accept-new"],
        capture=True,
        check=False,
    )
    connected = "successfully authenticated" in (test.stderr or "")

    # Git global config
    runner.run_as(ctx.username, ["git", "config", "--global", "user.email", email])
    git_name = typer.prompt("  Git display name", default="")
    if git_name:
        runner.run_as(ctx.username, ["git", "config", "--global", "user.name", git_name])
    runner.run_as(ctx.username, ["git", "config", "--global", "init.defaultBranch", "main"])

    status = "ok" if connected else "warn"
    detail = "connected" if connected else "key added but connection test failed — check GitHub"
    return ModuleResult(status=status, detail=detail)


def check() -> list[CheckItem]:
    key = Path("~/.ssh/id_ed25519_github").expanduser()
    items = [CheckItem(label="github ssh key", status="ok" if key.exists() else "warn")]
    if key.exists():
        result = runner.run(
            ["ssh", "-T", "git@github.com", "-o", "StrictHostKeyChecking=no"],
            capture=True,
            check=False,
        )
        ok = "successfully authenticated" in (result.stderr or "")
        items.append(CheckItem(label="github connection", status="ok" if ok else "fail"))
    return items
