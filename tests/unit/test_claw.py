"""Tests for devlair.modules.claw and devlair.features.claw."""
import getpass
import json
import subprocess
from pathlib import Path

import pytest

from devlair.features.claw import (
    _read_allowlist,
    _write_allowlist,
    allow_phone,
    revoke_phone,
    show_status,
)
from devlair.modules.claw import DOCKER_COMPOSE, PICOCLAW_CONFIG, PICOCLAW_APP, run, check

_USER = getpass.getuser()


# ── Module: run() ─────────────────────────────────────────────────────────────


def test_run_fails_without_docker(ctx, mock_runner):
    mock_runner["cmd_exists"].return_value = False
    result = run(ctx)
    assert result.status == "fail"
    assert "docker" in result.detail


def test_run_creates_directory_structure(ctx, mock_runner, mocker):
    mocker.patch("devlair.modules.claw.typer.prompt", return_value="sk-ant-test-key")
    mock_runner["run_shell"].return_value = subprocess.CompletedProcess(
        args=[], returncode=0, stdout="", stderr=""
    )

    result = run(ctx)

    claw_dir = ctx.user_home / ".devlair" / "claw"
    assert claw_dir.exists()
    assert (claw_dir / "agent-data").exists()
    assert (claw_dir / "docker-compose.yml").exists()
    assert (claw_dir / "picoclaw.yml").exists()
    assert (claw_dir / "allowlist.json").exists()
    assert (claw_dir / ".env").exists()
    assert (claw_dir / "picoclaw" / "Dockerfile").exists()
    assert (claw_dir / "picoclaw" / "app.py").exists()
    assert (claw_dir / "picoclaw" / "requirements.txt").exists()


def test_run_env_file_has_restricted_permissions(ctx, mock_runner, mocker):
    mocker.patch("devlair.modules.claw.typer.prompt", return_value="sk-ant-test-key")
    mock_runner["run_shell"].return_value = subprocess.CompletedProcess(
        args=[], returncode=0, stdout="", stderr=""
    )

    run(ctx)

    env_file = ctx.user_home / ".devlair" / "claw" / ".env"
    mode = oct(env_file.stat().st_mode & 0o777)
    assert mode == "0o600"


def test_run_preserves_existing_env(ctx, mock_runner, mocker):
    claw_dir = ctx.user_home / ".devlair" / "claw"
    claw_dir.mkdir(parents=True)
    env_file = claw_dir / ".env"
    env_file.write_text("ANTHROPIC_API_KEY=existing-key\nEVOLUTION_API_KEY=existing-evo\n")

    mock_runner["run_shell"].return_value = subprocess.CompletedProcess(
        args=[], returncode=0, stdout="", stderr=""
    )

    result = run(ctx)

    content = env_file.read_text()
    assert "existing-key" in content
    assert "existing-evo" in content


def test_run_compose_yaml_contains_security_settings(ctx, mock_runner, mocker):
    mocker.patch("devlair.modules.claw.typer.prompt", return_value="sk-ant-test-key")
    mock_runner["run_shell"].return_value = subprocess.CompletedProcess(
        args=[], returncode=0, stdout="", stderr=""
    )

    run(ctx)

    compose = (ctx.user_home / ".devlair" / "claw" / "docker-compose.yml").read_text()
    assert "build: ./picoclaw" in compose
    assert "read_only: true" in compose
    assert "cap_drop:" in compose
    assert "ALL" in compose
    assert "no-new-privileges" in compose
    assert '65534:65534' in compose


def test_run_picoclaw_config_blocks_shell_tools(ctx, mock_runner, mocker):
    mocker.patch("devlair.modules.claw.typer.prompt", return_value="sk-ant-test-key")
    mock_runner["run_shell"].return_value = subprocess.CompletedProcess(
        args=[], returncode=0, stdout="", stderr=""
    )

    run(ctx)

    config = (ctx.user_home / ".devlair" / "claw" / "picoclaw.yml").read_text()
    assert "- shell" in config  # in blocked_tools
    assert "- exec" in config
    assert "- bash" in config


# ── Module: check() ───────────────────────────────────────────────────────────


def test_check_skips_when_not_provisioned(mock_runner, tmp_home, mocker):
    mocker.patch("devlair.modules.claw.Path.home", return_value=tmp_home)

    items = check()
    assert len(items) == 1
    assert items[0].label == "claw provisioned"
    assert items[0].status == "warn"


def test_check_returns_items(mock_runner, tmp_home, mocker):
    mocker.patch("devlair.modules.claw.Path.home", return_value=tmp_home)

    # Provision the claw directory so check() doesn't skip
    claw_dir = tmp_home / ".devlair" / "claw"
    claw_dir.mkdir(parents=True)
    (claw_dir / "docker-compose.yml").write_text("name: claw\n")

    # Simulate containers not found
    mock_runner["get_output"].return_value = ""

    items = check()
    assert len(items) > 0
    labels = [i.label for i in items]
    assert "picoclaw container" in labels
    assert "evolution container" in labels


# ── Feature: allowlist ────────────────────────────────────────────────────────


def test_read_allowlist_empty(tmp_path):
    path = tmp_path / "allowlist.json"
    assert _read_allowlist(path) == []


def test_read_allowlist_with_numbers(tmp_path):
    path = tmp_path / "allowlist.json"
    path.write_text('["+5511999999999", "+5521888888888"]')
    result = _read_allowlist(path)
    assert result == ["+5511999999999", "+5521888888888"]


def test_read_allowlist_corrupt(tmp_path):
    path = tmp_path / "allowlist.json"
    path.write_text("not json")
    assert _read_allowlist(path) == []


def test_write_allowlist(tmp_path):
    path = tmp_path / "allowlist.json"
    phones = ["+5511999999999"]
    _write_allowlist(path, phones)
    data = json.loads(path.read_text())
    assert data == ["+5511999999999"]


def test_allow_phone_adds_number(tmp_home, mocker, capsys):
    mocker.patch("devlair.features.claw.Path.home", return_value=tmp_home)
    claw_dir = tmp_home / ".devlair" / "claw"
    claw_dir.mkdir(parents=True)
    (claw_dir / "allowlist.json").write_text("[]")

    allow_phone("+5511999999999")

    data = json.loads((claw_dir / "allowlist.json").read_text())
    assert "+5511999999999" in data
    captured = capsys.readouterr()
    assert "Added" in captured.out


def test_allow_phone_rejects_invalid(capsys):
    allow_phone("5511999999999")  # missing +
    captured = capsys.readouterr()
    assert "must start with +" in captured.out


def test_allow_phone_deduplicates(tmp_home, mocker, capsys):
    mocker.patch("devlair.features.claw.Path.home", return_value=tmp_home)
    claw_dir = tmp_home / ".devlair" / "claw"
    claw_dir.mkdir(parents=True)
    (claw_dir / "allowlist.json").write_text('["+5511999999999"]')

    allow_phone("+5511999999999")

    data = json.loads((claw_dir / "allowlist.json").read_text())
    assert len(data) == 1
    captured = capsys.readouterr()
    assert "already in" in captured.out


def test_revoke_phone_removes_number(tmp_home, mocker, capsys):
    mocker.patch("devlair.features.claw.Path.home", return_value=tmp_home)
    claw_dir = tmp_home / ".devlair" / "claw"
    claw_dir.mkdir(parents=True)
    (claw_dir / "allowlist.json").write_text('["+5511999999999", "+5521888888888"]')

    revoke_phone("+5511999999999")

    data = json.loads((claw_dir / "allowlist.json").read_text())
    assert "+5511999999999" not in data
    assert "+5521888888888" in data
    captured = capsys.readouterr()
    assert "Removed" in captured.out


def test_revoke_phone_not_found(tmp_home, mocker, capsys):
    mocker.patch("devlair.features.claw.Path.home", return_value=tmp_home)
    claw_dir = tmp_home / ".devlair" / "claw"
    claw_dir.mkdir(parents=True)
    (claw_dir / "allowlist.json").write_text("[]")

    revoke_phone("+5511999999999")

    captured = capsys.readouterr()
    assert "not in" in captured.out


# ── Feature: show_status ──────────────────────────────────────────────────────


def test_show_status_not_configured(tmp_home, mocker, capsys):
    mocker.patch("devlair.features.claw.Path.home", return_value=tmp_home)

    show_status()

    captured = capsys.readouterr()
    assert "not configured" in captured.out
