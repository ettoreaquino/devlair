import os
import shutil
import textwrap
import typer
from pathlib import Path

from devlair import runner
from devlair.console import console

_BISYNC_FLAGS = "--transfers 4 --retries 3 --resilient --create-empty-src-dirs"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rclone_bin() -> str:
    return shutil.which("rclone") or "/usr/local/bin/rclone"


def _rclone(username: str, user_home: Path, subcmd: str, quiet: bool = False):
    cmd = f'HOME="{user_home}" "{_rclone_bin()}" {subcmd}'
    if os.geteuid() == 0:
        return runner.run_shell_as(username, cmd, quiet=quiet, check=False)
    return runner.run_shell(cmd, quiet=quiet, check=False)


def _systemctl_user(username: str, subcmd: str, quiet: bool = True):
    uid = runner.get_output(f"id -u {username}")
    cmd = f'XDG_RUNTIME_DIR="/run/user/{uid}" systemctl --user {subcmd}'
    if os.geteuid() == 0:
        return runner.run_shell_as(username, cmd, quiet=quiet, check=False)
    return runner.run_shell(cmd, quiet=quiet, check=False)


def _chown(path: Path, username: str) -> None:
    if os.geteuid() == 0:
        shutil.chown(path, username, username)


def discover_timers(user_home: Path) -> list[Path]:
    systemd_dir = user_home / ".config" / "systemd" / "user"
    if not systemd_dir.exists():
        return []
    return sorted(systemd_dir.glob("rclone-*.timer"))


def timer_status(username: str, user_home: Path, timer_name: str) -> tuple[str, str]:
    """Return (active_state, last_run) for a named timer."""
    active = _systemctl_user(username, f"is-active {timer_name}").stdout.strip() or "unknown"
    last = _systemctl_user(
        username,
        f"show {timer_name.replace('.timer', '.service')} --property=ExecMainStartTimestamp --value",
    ).stdout.strip()
    return active, last or "never"


# ── Commands ──────────────────────────────────────────────────────────────────

def show_status(username: str, user_home: Path) -> None:
    timers = discover_timers(user_home)
    if not timers:
        console.print("  [muted]No syncs configured. Run [accent]devlair sync --add[/accent] to set one up.[/muted]")
        return

    for timer in timers:
        remote_name = timer.stem.removeprefix("rclone-")
        active, last = timer_status(username, user_home, timer.name)

        remote_path = local_path = "?"
        service = timer.with_suffix(".service")
        if service.exists():
            for line in service.read_text().splitlines():
                line = line.strip()
                if line.startswith("Description=rclone bisync "):
                    parts = line.removeprefix("Description=rclone bisync ").split(" -> ")
                    if len(parts) == 2:
                        remote_path, local_path = parts

        style = "success" if active == "active" else "warning"
        console.print(f"  [{style}]●[/{style}]  [accent]{remote_name}[/accent]")
        console.print(f"       [muted]{remote_path}[/muted]  →  [muted]{local_path}[/muted]")
        console.print(f"       timer: [{style}]{active}[/{style}]  ·  last run: [muted]{last}[/muted]")
        console.print()


def add_sync(username: str, user_home: Path) -> None:
    if not runner.cmd_exists("rclone"):
        console.print("  [muted]Installing rclone...[/muted]")
        runner.run_shell("curl -fsSL https://rclone.org/install.sh | bash", quiet=True)
        if not runner.cmd_exists("rclone"):
            console.print("  [error]rclone installation failed.[/error]")
            return

    console.print("\n  [info]Configure a new cloud folder sync.[/info]")
    console.print("  [muted]Example: gdrive:0. PERSONAL/store  →  ~/.store[/muted]")

    remote_path = typer.prompt("\n  Remote path (Enter to cancel)", default="")
    if not remote_path:
        console.print("  [muted]Cancelled.[/muted]")
        return

    remote_name = remote_path.split(":")[0]
    local_path_str = typer.prompt("  Local path")
    local_path = Path(local_path_str.replace("~", str(user_home)))

    # Configure remote if not already present
    existing = _rclone(username, user_home, "listremotes", quiet=True).stdout
    if f"{remote_name}:" not in existing:
        console.print(f"\n  [info]Launching 'rclone config' — create a remote named '[accent]{remote_name}[/accent]'.[/info]")
        console.print("  [muted]n (new remote) → name it as above → type: drive → follow prompts.[/muted]\n")
        _rclone(username, user_home, "config")

        existing = _rclone(username, user_home, "listremotes", quiet=True).stdout
        if f"{remote_name}:" not in existing:
            console.print(f"  [error]Remote '{remote_name}' not found after config — aborting.[/error]")
            return
    else:
        console.print(f"  [muted]Remote '{remote_name}' already exists — skipping rclone config.[/muted]")

    # Directories
    local_path.mkdir(parents=True, exist_ok=True)
    _chown(local_path, username)

    systemd_dir = user_home / ".config" / "systemd" / "user"
    systemd_dir.mkdir(parents=True, exist_ok=True)

    log_dir = user_home / ".local" / "log"
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file  = log_dir / f"rclone-{remote_name}.log"
    unit_name = f"rclone-{remote_name}"
    service   = systemd_dir / f"{unit_name}.service"
    timer     = systemd_dir / f"{unit_name}.timer"

    service.write_text(textwrap.dedent(f"""\
        [Unit]
        Description=rclone bisync {remote_path} -> {local_path}
        After=network-online.target
        Wants=network-online.target

        [Service]
        Type=oneshot
        Environment=HOME={user_home}
        ExecStart=/usr/bin/rclone bisync \\
            "{local_path}" \\
            "{remote_path}" \\
            --log-file {log_file} \\
            --log-level INFO \\
            {_BISYNC_FLAGS}
        StandardOutput=journal
        StandardError=journal
    """))

    timer.write_text(textwrap.dedent("""\
        [Unit]
        Description=Run rclone sync every 5 minutes

        [Timer]
        OnBootSec=2min
        OnUnitActiveSec=5min
        Persistent=true

        [Install]
        WantedBy=timers.target
    """))

    for path in [systemd_dir, service, timer, log_dir]:
        _chown(path, username)

    runner.run(["loginctl", "enable-linger", username], check=False)
    _systemctl_user(username, f"daemon-reload", quiet=True)
    _systemctl_user(username, f"enable --now {unit_name}.timer", quiet=True)

    # Initial sync — --resync bootstraps the bisync state on first run
    console.print("  [muted]Initial sync...[/muted]")
    _rclone(username, user_home, f'bisync "{local_path}" "{remote_path}" --resync {_BISYNC_FLAGS}')

    console.print(f"  [success]✓[/success]  {remote_path} ↔ {local_path} (every 5 min)")


def run_now(username: str, user_home: Path) -> None:
    timers = discover_timers(user_home)
    if not timers:
        console.print("  [muted]No syncs configured.[/muted]")
        return

    for timer in timers:
        unit_name = timer.stem
        console.print(f"  [muted]{unit_name}...[/muted]")
        _systemctl_user(username, f"start {unit_name}.service", quiet=False)


# ── Entry point ───────────────────────────────────────────────────────────────

def run_sync(add: bool = False, now: bool = False) -> None:
    from devlair.context import resolve_invoking_user
    username, user_home = resolve_invoking_user()

    if add:
        add_sync(username, user_home)
    elif now:
        run_now(username, user_home)
    else:
        show_status(username, user_home)
