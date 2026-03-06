"""Tests for the firewall module — validates logic, mocks all system calls."""
import pytest
import click
from pathlib import Path
from devlair.modules import firewall
from devlair.context import SetupContext


def test_run_calls_ufw_and_fail2ban(ctx: SetupContext, mock_runner, tmp_path, mocker):
    mocker.patch.object(firewall, "FAIL2BAN_JAIL", tmp_path / "jail.local")
    result = firewall.run(ctx)

    assert result.status == "ok"
    assert "ufw" in result.detail
    assert "fail2ban" in result.detail


def test_run_writes_fail2ban_config_when_missing(ctx: SetupContext, mock_runner, tmp_path, mocker):
    jail = tmp_path / "jail.local"
    mocker.patch.object(firewall, "FAIL2BAN_JAIL", jail)

    assert not jail.exists()
    firewall.run(ctx)
    assert jail.exists()
    assert "[sshd]" in jail.read_text()


def test_run_skips_fail2ban_config_when_present(ctx: SetupContext, mock_runner, tmp_path, mocker):
    jail = tmp_path / "jail.local"
    jail.write_text("[sshd]\nenabled = true\n")
    mocker.patch.object(firewall, "FAIL2BAN_JAIL", jail)

    firewall.run(ctx)
    # Content should be unchanged (sshd already present)
    assert jail.read_text() == "[sshd]\nenabled = true\n"


def test_run_resets_ufw(ctx: SetupContext, mock_runner, tmp_path, mocker):
    mocker.patch.object(firewall, "FAIL2BAN_JAIL", tmp_path / "jail.local")
    firewall.run(ctx)

    calls = [str(c) for c in mock_runner["run"].call_args_list]
    assert any("reset" in c for c in calls)


def test_check_ufw_active(mocker):
    mocker.patch("devlair.runner.get_output", side_effect=["Status: active", "active"])
    items = firewall.check()
    ufw_item = next(i for i in items if i.label == "ufw")
    assert ufw_item.status == "ok"


def test_check_ufw_inactive(mocker):
    mocker.patch("devlair.runner.get_output", side_effect=["Status: inactive", "inactive"])
    items = firewall.check()
    ufw_item = next(i for i in items if i.label == "ufw")
    assert ufw_item.status == "fail"


def test_check_fail2ban_active(mocker):
    mocker.patch("devlair.runner.get_output", side_effect=["Status: active", "active"])
    items = firewall.check()
    f2b_item = next(i for i in items if i.label == "fail2ban")
    assert f2b_item.status == "ok"


def test_check_fail2ban_inactive(mocker):
    mocker.patch("devlair.runner.get_output", side_effect=["Status: active", "inactive"])
    items = firewall.check()
    f2b_item = next(i for i in items if i.label == "fail2ban")
    assert f2b_item.status == "fail"


def test_idempotent(ctx: SetupContext, mock_runner, tmp_path, mocker):
    """Running twice should not raise and return ok both times."""
    mocker.patch.object(firewall, "FAIL2BAN_JAIL", tmp_path / "jail.local")
    result1 = firewall.run(ctx)
    result2 = firewall.run(ctx)
    assert result1.status == "ok"
    assert result2.status == "ok"
