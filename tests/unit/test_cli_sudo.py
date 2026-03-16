"""Tests for the sudo elevation experience in cli.py."""
import os
import subprocess
import sys

import click
import pytest
import typer

from devlair import cli

_EXIT_EXCEPTIONS = (SystemExit, click.exceptions.Exit)


def _exit_code(exc):
    """Extract exit code from SystemExit (.code) or click Exit (.exit_code)."""
    if hasattr(exc, "exit_code"):
        return exc.exit_code
    return exc.code


class TestElevateIfNeeded:
    """Tests for _elevate_if_needed()."""

    def test_noop_when_already_root(self, mocker):
        mocker.patch("os.geteuid", return_value=0)
        # Should return without doing anything
        cli._elevate_if_needed()

    def test_calls_sudo_with_sys_argv(self, mocker):
        mocker.patch("os.geteuid", return_value=1000)
        fake_argv = ["/usr/bin/devlair", "update"]
        mocker.patch.object(sys, "argv", fake_argv)
        mock_run = mocker.patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess(args=[], returncode=0),
        )

        with pytest.raises(_EXIT_EXCEPTIONS) as exc_info:
            cli._elevate_if_needed()

        mock_run.assert_called_once_with(["sudo"] + fake_argv)
        assert _exit_code(exc_info.value) == 0

    def test_exit_code_forwarded(self, mocker):
        mocker.patch("os.geteuid", return_value=1000)
        mocker.patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess(args=[], returncode=42),
        )

        with pytest.raises(_EXIT_EXCEPTIONS) as exc_info:
            cli._elevate_if_needed()

        assert _exit_code(exc_info.value) == 42

    def test_sudo_not_installed(self, mocker):
        mocker.patch("os.geteuid", return_value=1000)
        mocker.patch("subprocess.run", side_effect=FileNotFoundError)

        with pytest.raises(_EXIT_EXCEPTIONS) as exc_info:
            cli._elevate_if_needed()

        assert _exit_code(exc_info.value) == 1

    def test_keyboard_interrupt(self, mocker):
        mocker.patch("os.geteuid", return_value=1000)
        mocker.patch("subprocess.run", side_effect=KeyboardInterrupt)

        with pytest.raises(_EXIT_EXCEPTIONS) as exc_info:
            cli._elevate_if_needed()

        assert _exit_code(exc_info.value) == 130

    def test_permission_denied_exit_126(self, mocker, capsys):
        mocker.patch("os.geteuid", return_value=1000)
        mocker.patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess(args=[], returncode=126),
        )

        with pytest.raises(_EXIT_EXCEPTIONS) as exc_info:
            cli._elevate_if_needed()

        assert _exit_code(exc_info.value) == 126

    def test_auth_failure_exit_1(self, mocker):
        mocker.patch("os.geteuid", return_value=1000)
        mocker.patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess(args=[], returncode=1),
        )

        with pytest.raises(_EXIT_EXCEPTIONS) as exc_info:
            cli._elevate_if_needed()

        assert _exit_code(exc_info.value) == 1


class TestRequireRoot:
    """Tests for _require_root()."""

    def test_returns_sudo_user(self, mocker):
        mocker.patch("os.geteuid", return_value=0)
        mocker.patch.dict(os.environ, {"SUDO_USER": "alice"})

        assert cli._require_root() == "alice"

    def test_prompts_when_no_sudo_user(self, mocker):
        mocker.patch("os.geteuid", return_value=0)
        mocker.patch.dict(os.environ, {"SUDO_USER": ""}, clear=False)
        mocker.patch("typer.prompt", return_value="bob")

        assert cli._require_root() == "bob"

    def test_prompts_when_sudo_user_is_root(self, mocker):
        mocker.patch("os.geteuid", return_value=0)
        mocker.patch.dict(os.environ, {"SUDO_USER": "root"}, clear=False)
        mocker.patch("typer.prompt", return_value="carol")

        assert cli._require_root() == "carol"


class TestCommandsCallElevate:
    """Verify that update and disable-password call _elevate_if_needed."""

    def test_update_elevates(self, mocker):
        mock_elevate = mocker.patch("devlair.cli._elevate_if_needed")
        mocker.patch("devlair.features.update.run_update")

        from typer.testing import CliRunner
        runner = CliRunner()
        result = runner.invoke(cli.app, ["update"])

        mock_elevate.assert_called_once()

    def test_disable_password_elevates(self, mocker):
        mock_elevate = mocker.patch("devlair.cli._elevate_if_needed")
        mocker.patch("devlair.features.disable_password.run_disable_password")

        from typer.testing import CliRunner
        runner = CliRunner()
        result = runner.invoke(cli.app, ["disable-password"])

        mock_elevate.assert_called_once()
