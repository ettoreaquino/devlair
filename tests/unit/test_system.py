"""Tests for the system module — validates apt calls are made correctly."""

from devlair.context import SetupContext
from devlair.modules import system


def test_run_calls_apt_update(ctx: SetupContext, mock_runner):
    system.run(ctx)

    run_calls = [str(c) for c in mock_runner["run"].call_args_list]
    assert any("update" in c for c in run_calls)


def test_run_calls_apt_upgrade(ctx: SetupContext, mock_runner):
    system.run(ctx)

    run_calls = [str(c) for c in mock_runner["run"].call_args_list]
    assert any("upgrade" in c for c in run_calls)


def test_run_installs_essentials_on_linux(ctx: SetupContext, mock_runner):
    ctx.platform = "linux"
    system.run(ctx)

    all_installed = [pkg for call in mock_runner["apt_install"].call_args_list for pkg in call.args]
    for pkg in ["git", "curl", "tmux", "zsh"]:
        assert pkg in all_installed
    for pkg in ["openssh-server", "ufw", "fail2ban", "avahi-daemon"]:
        assert pkg in all_installed


def test_run_skips_linux_essentials_on_wsl(ctx: SetupContext, mock_runner):
    ctx.platform = "wsl"
    system.run(ctx)

    all_installed = [pkg for call in mock_runner["apt_install"].call_args_list for pkg in call.args]
    for pkg in ["git", "curl", "tmux", "zsh"]:
        assert pkg in all_installed
    for pkg in ["openssh-server", "ufw", "fail2ban", "avahi-daemon"]:
        assert pkg not in all_installed, f"'{pkg}' should not be installed on WSL"


def test_run_returns_ok(ctx: SetupContext, mock_runner):
    result = system.run(ctx)
    assert result.status == "ok"


def test_idempotent(ctx: SetupContext, mock_runner):
    result1 = system.run(ctx)
    result2 = system.run(ctx)
    assert result1.status == "ok"
    assert result2.status == "ok"


def test_check_installed_on_linux(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=True)
    mocker.patch("devlair.modules.system.detect_platform", return_value="linux")
    items = system.check()
    labels = [i.label for i in items]
    assert all(i.status == "ok" for i in items)
    assert "ufw" in labels
    assert "fail2ban" in labels


def test_check_missing_on_linux(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=False)
    mocker.patch("devlair.modules.system.detect_platform", return_value="linux")
    items = system.check()
    assert all(i.status == "fail" for i in items)


def test_check_excludes_linux_tools_on_wsl(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=True)
    mocker.patch("devlair.modules.system.detect_platform", return_value="wsl")
    items = system.check()
    labels = [i.label for i in items]
    assert "ufw" not in labels
    assert "fail2ban" not in labels
