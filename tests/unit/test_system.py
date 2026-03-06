"""Tests for the system module — validates apt calls are made correctly."""
import pytest
from devlair.modules import system
from devlair.context import SetupContext


def test_run_calls_apt_update(ctx: SetupContext, mock_runner):
    system.run(ctx)

    run_calls = [str(c) for c in mock_runner["run"].call_args_list]
    assert any("update" in c for c in run_calls)


def test_run_calls_apt_upgrade(ctx: SetupContext, mock_runner):
    system.run(ctx)

    run_calls = [str(c) for c in mock_runner["run"].call_args_list]
    assert any("upgrade" in c for c in run_calls)


def test_run_installs_essentials(ctx: SetupContext, mock_runner):
    system.run(ctx)

    apt_calls = mock_runner["apt_install"].call_args_list
    assert len(apt_calls) == 1

    installed = apt_calls[0].args  # positional *packages
    for pkg in ["git", "curl", "tmux", "zsh", "ufw", "fail2ban"]:
        assert pkg in installed, f"Expected '{pkg}' in apt_install call"


def test_run_returns_ok(ctx: SetupContext, mock_runner):
    result = system.run(ctx)
    assert result.status == "ok"


def test_idempotent(ctx: SetupContext, mock_runner):
    result1 = system.run(ctx)
    result2 = system.run(ctx)
    assert result1.status == "ok"
    assert result2.status == "ok"


def test_check_installed(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=True)
    items = system.check()
    assert all(i.status == "ok" for i in items)


def test_check_missing(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=False)
    items = system.check()
    assert all(i.status == "fail" for i in items)
