import os
import re
import shutil
import textwrap
import typer
from pathlib import Path
from typing import Optional

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


_VALID_NAME = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")


def _validate_sync_name(name: str) -> str:
    """Validate and return a sync name, or raise typer.BadParameter."""
    name = name.strip().lower()
    if not name:
        raise typer.BadParameter("Sync name cannot be empty.")
    if len(name) > 30:
        raise typer.BadParameter("Sync name must be 30 characters or fewer.")
    if not _VALID_NAME.match(name):
        raise typer.BadParameter("Use only lowercase letters, numbers, and hyphens (e.g. 'store', 'my-vault').")
    return name


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

def parse_sync_info(timer: Path) -> tuple[str, str, str]:
    """Return (sync_name, remote_path, local_path) from a timer's service file."""
    sync_name = timer.stem.removeprefix("rclone-")
    remote_path = local_path = "?"
    service = timer.with_suffix(".service")
    if service.exists():
        for line in service.read_text().splitlines():
            line = line.strip()
            if line.startswith("Description=rclone bisync "):
                parts = line.removeprefix("Description=rclone bisync ").split(" -> ")
                if len(parts) == 2:
                    remote_path, local_path = parts
    return sync_name, remote_path, local_path


def show_status(username: str, user_home: Path) -> None:
    timers = discover_timers(user_home)
    if not timers:
        console.print("  [muted]No syncs configured. Run [accent]devlair sync --add[/accent] to set one up.[/muted]")
        return

    for timer in timers:
        sync_name, remote_path, local_path = parse_sync_info(timer)
        active, last = timer_status(username, user_home, timer.name)

        style = "success" if active == "active" else "warning"
        console.print(f"  [{style}]●[/{style}]  [accent]{sync_name}[/accent]")
        console.print(f"       [muted]{remote_path}[/muted]  →  [muted]{local_path}[/muted]")
        console.print(f"       timer: [{style}]{active}[/{style}]  ·  last run: [muted]{last}[/muted]")
        console.print()


def add_sync(username: str, user_home: Path, name: Optional[str] = None) -> None:
    if not runner.cmd_exists("rclone"):
        console.print("  [muted]Installing rclone...[/muted]")
        runner.run_shell("curl -fsSL https://rclone.org/install.sh | bash", quiet=True)
        if not runner.cmd_exists("rclone"):
            console.print("  [error]rclone installation failed.[/error]")
            return

    console.print("\n  [info]Configure a new cloud folder sync.[/info]")
    console.print("  [muted]Example: gdrive:0. PERSONAL/store  →  ~/.store[/muted]")

    # Sync name — user-chosen, used as the systemd unit name
    if not name:
        console.print("\n  [muted]Pick a short name for this sync (e.g. store, vault, photos).[/muted]")
        while True:
            raw = typer.prompt("  Sync name (Enter to cancel)", default="")
            if not raw:
                console.print("  [muted]Cancelled.[/muted]")
                return
            try:
                name = _validate_sync_name(raw)
                break
            except typer.BadParameter as e:
                console.print(f"  [error]{e}[/error]")
    else:
        name = _validate_sync_name(name)

    # Check for name collision
    systemd_dir = user_home / ".config" / "systemd" / "user"
    if (systemd_dir / f"rclone-{name}.timer").exists():
        console.print(f"  [error]A sync named '{name}' already exists. Choose a different name.[/error]")
        return

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

    systemd_dir.mkdir(parents=True, exist_ok=True)

    log_dir = user_home / ".local" / "log"
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file  = log_dir / f"rclone-{name}.log"
    unit_name = f"rclone-{name}"
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
    result = _rclone(username, user_home, f'bisync "{local_path}" "{remote_path}" --resync {_BISYNC_FLAGS}')

    if result.returncode != 0:
        console.print(f"  [error]Initial sync failed (exit {result.returncode}). Rolling back.[/error]")
        _systemctl_user(username, f"stop {unit_name}.timer")
        _systemctl_user(username, f"disable {unit_name}.timer")
        _systemctl_user(username, "daemon-reload")
        service.unlink(missing_ok=True)
        timer.unlink(missing_ok=True)
        log_file.unlink(missing_ok=True)
        console.print("  [muted]Systemd units removed. Fix the issue and retry with [accent]devlair sync --add[/accent].[/muted]")
        return

    console.print(f"  [success]✓[/success]  {remote_path} ↔ {local_path} (every 5 min)")


def remove_sync(username: str, user_home: Path, name: Optional[str] = None) -> None:
    timers = discover_timers(user_home)
    if not timers:
        console.print("  [muted]No syncs configured.[/muted]")
        return

    syncs = [(t, *parse_sync_info(t)) for t in timers]

    if name:
        match = [s for s in syncs if s[1] == name]
        if not match:
            console.print(f"  [error]No sync named '{name}'.[/error]")
            return
        selected = match[0]
        console.print(f"  {selected[1]}: {selected[2]} ↔ {selected[3]}")
        if not typer.confirm("  Remove this sync?"):
            console.print("  [muted]Cancelled.[/muted]")
            return
    elif len(syncs) == 1:
        selected = syncs[0]
        console.print(f"  {selected[1]}: {selected[2]} ↔ {selected[3]}")
        if not typer.confirm("  Remove this sync?"):
            console.print("  [muted]Cancelled.[/muted]")
            return
    else:
        for i, (_, sname, rpath, lpath) in enumerate(syncs, 1):
            console.print(f"  {i}) {sname}: {rpath} ↔ {lpath}")
        choice = typer.prompt("  Select sync to remove (number)")
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(syncs):
                raise ValueError
        except ValueError:
            console.print("  [error]Invalid selection.[/error]")
            return
        selected = syncs[idx]

    timer_path = selected[0]
    unit_name = timer_path.stem
    remote_path = selected[2]
    local_path = selected[3]

    _systemctl_user(username, f"stop {unit_name}.timer")
    _systemctl_user(username, f"disable {unit_name}.timer")
    _systemctl_user(username, "daemon-reload")

    timer_path.unlink(missing_ok=True)
    timer_path.with_suffix(".service").unlink(missing_ok=True)

    log_file = user_home / ".local" / "log" / f"{unit_name}.log"
    log_file.unlink(missing_ok=True)

    console.print(f"  [success]✓[/success]  Removed {remote_path} ↔ {local_path}")


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

def run_sync(add: bool = False, now: bool = False, remove: bool = False, name: str | None = None) -> None:
    from devlair.context import resolve_invoking_user
    username, user_home = resolve_invoking_user()

    if add:
        add_sync(username, user_home, name=name)
    elif remove:
        remove_sync(username, user_home, name=name)
    elif now:
        run_now(username, user_home)
    else:
        show_status(username, user_home)
