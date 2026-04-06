"""Shared fixtures for devlair tests."""

import getpass
from pathlib import Path

import pytest

from devlair.context import SetupContext

_REAL_USER = getpass.getuser()


@pytest.fixture
def tmp_home(tmp_path: Path) -> Path:
    """A temporary directory that acts as the user's home."""
    home = tmp_path / "home" / _REAL_USER
    home.mkdir(parents=True)
    return home


@pytest.fixture
def ctx(tmp_home: Path) -> SetupContext:
    """
    A SetupContext pointing at the temporary home.
    Uses the real running user so shutil.chown can resolve the uid/gid.
    """
    return SetupContext(username=_REAL_USER, user_home=tmp_home)


@pytest.fixture
def mock_runner(mocker):
    """
    Patch all runner functions to be no-ops by default.
    Individual tests override specific calls as needed.
    """
    mocks = {
        "run": mocker.patch("devlair.runner.run", return_value=_fake_proc()),
        "run_as": mocker.patch("devlair.runner.run_as", return_value=_fake_proc()),
        "run_shell": mocker.patch("devlair.runner.run_shell", return_value=_fake_proc()),
        "run_shell_as": mocker.patch("devlair.runner.run_shell_as", return_value=_fake_proc()),
        "apt_install": mocker.patch("devlair.runner.apt_install", return_value=None),
        "cmd_exists": mocker.patch("devlair.runner.cmd_exists", return_value=True),
        "get_output": mocker.patch("devlair.runner.get_output", return_value=""),
    }
    return mocks


def _fake_proc(stdout: str = "", stderr: str = "", returncode: int = 0):
    """Return a minimal CompletedProcess-like object."""
    import subprocess

    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)
