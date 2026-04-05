"""Tests for the disable-password feature."""

import os
from pathlib import Path
from unittest.mock import MagicMock

import click
import pytest

from devlair.features import disable_password

_EXIT_EXCEPTIONS = (SystemExit, click.exceptions.Exit)


def _write_sshd_conf(path: Path, password_auth: str = "yes") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"ListenAddress 100.1.2.3\nPort 22\nPasswordAuthentication {password_auth}\nAllowUsers testuser\n")


def test_exits_when_not_root(mocker):
    mocker.patch("os.geteuid", return_value=1000)
    with pytest.raises(_EXIT_EXCEPTIONS):
        disable_password.run_disable_password()


def test_exits_when_no_authorized_keys(tmp_path, mocker):
    mocker.patch("os.geteuid", return_value=0)
    mocker.patch.dict(os.environ, {"SUDO_USER": "testuser"})

    pw = MagicMock()
    pw.pw_dir = str(tmp_path / "home" / "testuser")
    mocker.patch("pwd.getpwnam", return_value=pw)

    # authorized_keys does not exist
    with pytest.raises(_EXIT_EXCEPTIONS):
        disable_password.run_disable_password()


def test_disables_password_auth(tmp_path, mocker):
    mocker.patch("os.geteuid", return_value=0)
    mocker.patch.dict(os.environ, {"SUDO_USER": "testuser"})

    home = tmp_path / "home" / "testuser"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "authorized_keys").write_text("ssh-ed25519 AAAA testkey\n")

    pw = MagicMock()
    pw.pw_dir = str(home)
    mocker.patch("pwd.getpwnam", return_value=pw)

    sshd_conf = tmp_path / "99-hardened.conf"
    _write_sshd_conf(sshd_conf)
    mocker.patch.object(disable_password, "SSHD_CONF", sshd_conf)
    mocker.patch("devlair.runner.run", return_value=None)
    mocker.patch("typer.confirm", return_value=True)

    disable_password.run_disable_password()

    content = sshd_conf.read_text()
    assert "PasswordAuthentication no" in content
    assert "PasswordAuthentication yes" not in content


def test_aborts_on_user_decline(tmp_path, mocker):
    mocker.patch("os.geteuid", return_value=0)
    mocker.patch.dict(os.environ, {"SUDO_USER": "testuser"})

    home = tmp_path / "home" / "testuser"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "authorized_keys").write_text("ssh-ed25519 AAAA testkey\n")

    pw = MagicMock()
    pw.pw_dir = str(home)
    mocker.patch("pwd.getpwnam", return_value=pw)

    sshd_conf = tmp_path / "99-hardened.conf"
    _write_sshd_conf(sshd_conf)
    mocker.patch.object(disable_password, "SSHD_CONF", sshd_conf)
    mocker.patch("typer.confirm", return_value=False)

    disable_password.run_disable_password()

    # File must be unchanged
    assert "PasswordAuthentication yes" in sshd_conf.read_text()


def test_idempotent(tmp_path, mocker):
    """Running twice leaves exactly one 'PasswordAuthentication no' line."""
    mocker.patch("os.geteuid", return_value=0)
    mocker.patch.dict(os.environ, {"SUDO_USER": "testuser"})

    home = tmp_path / "home" / "testuser"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "authorized_keys").write_text("ssh-ed25519 AAAA testkey\n")

    pw = MagicMock()
    pw.pw_dir = str(home)
    mocker.patch("pwd.getpwnam", return_value=pw)

    sshd_conf = tmp_path / "99-hardened.conf"
    _write_sshd_conf(sshd_conf)
    mocker.patch.object(disable_password, "SSHD_CONF", sshd_conf)
    mocker.patch("devlair.runner.run", return_value=None)
    mocker.patch("typer.confirm", return_value=True)

    disable_password.run_disable_password()
    disable_password.run_disable_password()

    content = sshd_conf.read_text()
    assert content.count("PasswordAuthentication no") == 1
    assert "PasswordAuthentication yes" not in content
