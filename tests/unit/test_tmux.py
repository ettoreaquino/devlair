"""Tests for the tmux module — writes .tmux.conf, no system calls needed."""
import pytest
from pathlib import Path
from devlair.modules import tmux
from devlair.context import SetupContext


def test_run_creates_tmux_conf(ctx: SetupContext, mock_runner):
    result = tmux.run(ctx)

    conf = ctx.user_home / ".tmux.conf"
    assert conf.exists(), ".tmux.conf was not created"
    assert result.status == "ok"


def test_tmux_conf_contains_dracula_colors(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()

    for color in ["#282a36", "#bd93f9", "#f8f8f2", "#50fa7b", "#ff5555"]:
        assert color in conf, f"Dracula color {color} missing from .tmux.conf"


def test_tmux_conf_contains_prefix(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "set -g prefix C-a" in conf


def test_tmux_conf_has_mouse_and_history(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "set -g mouse on" in conf
    assert "set -g history-limit 50000" in conf


def test_idempotent(ctx: SetupContext, mock_runner):
    """Running twice produces the same file."""
    tmux.run(ctx)
    first = (ctx.user_home / ".tmux.conf").read_text()

    tmux.run(ctx)
    second = (ctx.user_home / ".tmux.conf").read_text()

    assert first == second


def test_tmux_conf_has_git_branch_in_status(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "git -C #{pane_current_path} branch --show-current" in conf
    assert "D_GREEN" in conf.split("status-right")[1].split("\n")[0]


def test_tmux_conf_has_tpm_and_resurrect(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "tmux-plugins/tpm" in conf
    assert "tmux-plugins/tmux-resurrect" in conf
    assert "@resurrect-processes 'false'" in conf


def test_tmux_conf_has_claude_popup(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "claude-$(echo #{pane_current_path}" in conf
    assert "display-popup" in conf


def test_run_clones_tpm_as_user_when_missing(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    calls = [str(c) for c in mock_runner["run_as"].call_args_list]
    assert any("tpm" in c for c in calls), "TPM should be cloned via run_as on first run"


def test_run_installs_tpm_plugins_as_user(ctx: SetupContext, mock_runner):
    """install_plugins must run as user so it reads the user's .tmux.conf."""
    tpm_path = ctx.user_home / ".tmux" / "plugins" / "tpm"
    tpm_path.mkdir(parents=True)
    (tpm_path / "bin").mkdir()
    (tpm_path / "bin" / "install_plugins").write_text("#!/bin/bash\n")

    tmux.run(ctx)

    calls = [str(c) for c in mock_runner["run_as"].call_args_list]
    assert any("install_plugins" in c for c in calls), \
        "install_plugins should be run via run_as (as the user)"


def test_run_skips_tpm_clone_when_present(ctx: SetupContext, mock_runner):
    tpm_path = ctx.user_home / ".tmux" / "plugins" / "tpm"
    tpm_path.mkdir(parents=True)

    tmux.run(ctx)

    # run_as should NOT have been called with a git clone
    clone_calls = [
        c for c in mock_runner["run_as"].call_args_list
        if "clone" in str(c)
    ]
    assert not clone_calls, "TPM should not be re-cloned when already present"


def test_run_creates_plugins_dir(ctx: SetupContext, mock_runner):
    """The .tmux/plugins dir must exist before cloning into it."""
    tmux.run(ctx)
    plugins_dir = ctx.user_home / ".tmux" / "plugins"
    assert plugins_dir.exists()


def test_run_installs_wl_clipboard_when_no_clip_tool(ctx: SetupContext, mocker):
    mocker.patch("devlair.runner.run_as", return_value=None)
    mocker.patch("devlair.runner.cmd_exists", return_value=False)
    mock_apt = mocker.patch("devlair.runner.apt_install")
    tmux.run(ctx)
    mock_apt.assert_called_once_with("wl-clipboard", quiet=True)


def test_run_skips_wl_clipboard_when_present(ctx: SetupContext, mock_runner):
    tmux.run(ctx)
    mock_runner["apt_install"].assert_not_called()


def test_check_reports_missing_tmux(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=False)
    items = tmux.check()
    installed = next(i for i in items if i.label == "tmux installed")
    assert installed.status == "fail"


def test_check_reports_installed_tmux(mocker):
    mocker.patch("devlair.runner.cmd_exists", return_value=True)
    items = tmux.check()
    installed = next(i for i in items if i.label == "tmux installed")
    assert installed.status == "ok"


def test_check_reports_tpm_plugins_and_clipboard(mocker, tmp_path):
    mocker.patch("devlair.runner.cmd_exists", return_value=True)
    items = tmux.check()
    labels = [i.label for i in items]
    assert "TPM plugins (resurrect + continuum)" in labels
    assert "Clipboard tool (wl-copy / xclip)" in labels
