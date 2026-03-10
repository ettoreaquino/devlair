"""Tests for the tmux module — writes .tmux.conf, no system calls needed."""
import pytest
from pathlib import Path
from devlair.modules import tmux
from devlair.context import SetupContext


def test_run_creates_tmux_conf(ctx: SetupContext):
    result = tmux.run(ctx)

    conf = ctx.user_home / ".tmux.conf"
    assert conf.exists(), ".tmux.conf was not created"
    assert result.status == "ok"


def test_tmux_conf_contains_dracula_colors(ctx: SetupContext):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()

    for color in ["#282a36", "#bd93f9", "#f8f8f2", "#50fa7b", "#ff5555"]:
        assert color in conf, f"Dracula color {color} missing from .tmux.conf"


def test_tmux_conf_contains_prefix(ctx: SetupContext):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "set -g prefix C-a" in conf


def test_tmux_conf_has_mouse_and_history(ctx: SetupContext):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "set -g mouse on" in conf
    assert "set -g history-limit 50000" in conf


def test_idempotent(ctx: SetupContext):
    """Running twice produces the same file."""
    tmux.run(ctx)
    first = (ctx.user_home / ".tmux.conf").read_text()

    tmux.run(ctx)
    second = (ctx.user_home / ".tmux.conf").read_text()

    assert first == second


def test_tmux_conf_has_git_branch_in_status(ctx: SetupContext):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "git -C #{pane_current_path} branch --show-current" in conf
    assert "D_GREEN" in conf.split("status-right")[1].split("\n")[0]


def test_tmux_conf_has_tpm_and_resurrect(ctx: SetupContext):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "tmux-plugins/tpm" in conf
    assert "tmux-plugins/tmux-resurrect" in conf
    assert "@resurrect-processes 'false'" in conf


def test_tmux_conf_has_claude_popup(ctx: SetupContext):
    tmux.run(ctx)
    conf = (ctx.user_home / ".tmux.conf").read_text()
    assert "claude-$(echo #{pane_current_path}" in conf
    assert "display-popup" in conf


def test_run_clones_tpm_when_missing(ctx: SetupContext, mocker):
    mock_run = mocker.patch("devlair.runner.run")
    tmux.run(ctx)
    calls = [str(c) for c in mock_run.call_args_list]
    assert any("tpm" in c for c in calls), "TPM should be cloned on first run"


def test_run_skips_tpm_clone_when_present(ctx: SetupContext, mocker):
    tpm_path = ctx.user_home / ".tmux" / "plugins" / "tpm"
    tpm_path.mkdir(parents=True)
    mock_run = mocker.patch("devlair.runner.run")
    tmux.run(ctx)
    mock_run.assert_not_called()


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
