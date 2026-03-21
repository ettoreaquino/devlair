"""Tests for devlair.features.sync — parse_sync_info and remove_sync."""
import getpass
import textwrap
from pathlib import Path
from unittest.mock import call

import pytest
import typer

from devlair.features.sync import _validate_sync_name, parse_sync_info, remove_sync

_USER = getpass.getuser()

SERVICE_CONTENT = textwrap.dedent("""\
    [Unit]
    Description=rclone bisync gdrive:docs -> /home/user/docs
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=oneshot
    ExecStart=/usr/bin/rclone bisync /home/user/docs gdrive:docs
""")


def _create_sync(tmp_home: Path, name: str = "gdrive",
                 remote: str = "gdrive:docs", local: str = "/home/user/docs") -> Path:
    """Create a fake timer + service pair and return the timer path."""
    systemd_dir = tmp_home / ".config" / "systemd" / "user"
    systemd_dir.mkdir(parents=True, exist_ok=True)
    timer = systemd_dir / f"rclone-{name}.timer"
    service = systemd_dir / f"rclone-{name}.service"
    timer.write_text("[Timer]\nOnBootSec=2min\n")
    service.write_text(textwrap.dedent(f"""\
        [Unit]
        Description=rclone bisync {remote} -> {local}

        [Service]
        Type=oneshot
        ExecStart=/usr/bin/rclone bisync "{local}" "{remote}"
    """))
    # Also create a log file
    log_dir = tmp_home / ".local" / "log"
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / f"rclone-{name}.log").write_text("log data")
    return timer


# ── _validate_sync_name ──────────────────────────────────────────────────────

def test_validate_sync_name_simple():
    assert _validate_sync_name("store") == "store"


def test_validate_sync_name_with_hyphens():
    assert _validate_sync_name("my-vault") == "my-vault"


def test_validate_sync_name_uppercase_normalized():
    assert _validate_sync_name("Store") == "store"


def test_validate_sync_name_rejects_spaces():
    with pytest.raises(typer.BadParameter):
        _validate_sync_name("my store")


def test_validate_sync_name_rejects_empty():
    with pytest.raises(typer.BadParameter):
        _validate_sync_name("")


# ── parse_sync_info ──────────────────────────────────────────────────────────

def test_parse_sync_info(tmp_home):
    timer = _create_sync(tmp_home, name="store")
    sname, rpath, lpath = parse_sync_info(timer)
    assert sname == "store"
    assert rpath == "gdrive:docs"
    assert lpath == "/home/user/docs"


def test_parse_sync_info_missing_service(tmp_home):
    systemd_dir = tmp_home / ".config" / "systemd" / "user"
    systemd_dir.mkdir(parents=True, exist_ok=True)
    timer = systemd_dir / "rclone-missing.timer"
    timer.write_text("[Timer]\n")
    rname, rpath, lpath = parse_sync_info(timer)
    assert rname == "missing"
    assert rpath == "?"
    assert lpath == "?"


# ── remove_sync ──────────────────────────────────────────────────────────────

def test_remove_no_syncs(tmp_home, mock_runner, capsys):
    remove_sync(_USER, tmp_home)
    captured = capsys.readouterr()
    assert "No syncs configured" in captured.out


def test_remove_by_name(tmp_home, mock_runner, mocker):
    timer = _create_sync(tmp_home, name="store")
    mocker.patch("devlair.features.sync.typer.confirm", return_value=True)

    remove_sync(_USER, tmp_home, name="store")

    assert not timer.exists()
    assert not timer.with_suffix(".service").exists()
    assert not (tmp_home / ".local" / "log" / "rclone-store.log").exists()


def test_remove_by_name_not_found(tmp_home, mock_runner, capsys):
    _create_sync(tmp_home)
    remove_sync(_USER, tmp_home, name="missing")
    captured = capsys.readouterr()
    assert "No sync named 'missing'" in captured.out


def test_remove_single_sync(tmp_home, mock_runner, mocker):
    timer = _create_sync(tmp_home)
    mocker.patch("devlair.features.sync.typer.confirm", return_value=True)

    remove_sync(_USER, tmp_home)

    assert not timer.exists()
    assert not timer.with_suffix(".service").exists()

    # Verify systemctl calls
    systemctl = mock_runner["run_shell"]
    cmds = [c.args[0] for c in systemctl.call_args_list]
    assert any("stop rclone-gdrive.timer" in c for c in cmds)
    assert any("disable rclone-gdrive.timer" in c for c in cmds)
    assert any("daemon-reload" in c for c in cmds)


def test_remove_cancelled(tmp_home, mock_runner, mocker):
    timer = _create_sync(tmp_home)
    mocker.patch("devlair.features.sync.typer.confirm", return_value=False)

    remove_sync(_USER, tmp_home)

    assert timer.exists()
    assert timer.with_suffix(".service").exists()


def test_remove_multiple_syncs(tmp_home, mock_runner, mocker):
    _create_sync(tmp_home, name="gdrive", remote="gdrive:docs", local="/home/user/docs")
    timer2 = _create_sync(tmp_home, name="icloud", remote="icloud:files", local="/home/user/files")

    mocker.patch("devlair.features.sync.typer.prompt", return_value="2")

    remove_sync(_USER, tmp_home)

    # Only icloud (selection 2) should be removed
    assert not timer2.exists()
    assert not timer2.with_suffix(".service").exists()
    # gdrive should still exist
    gdrive_timer = tmp_home / ".config" / "systemd" / "user" / "rclone-gdrive.timer"
    assert gdrive_timer.exists()
