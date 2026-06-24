from unittest.mock import MagicMock

import pytest

from devlair.context import SetupContext
from devlair.modules import devtools


def _ctx(platform: str, tmp_path) -> SetupContext:
    ctx = MagicMock(spec=SetupContext)
    ctx.platform = platform
    ctx.username = "testuser"
    ctx.user_home = tmp_path
    return ctx


@pytest.fixture()
def mock_runner(mocker):
    mocker.patch("devlair.modules.devtools.runner.cmd_exists", return_value=True)
    mocker.patch("devlair.modules.devtools.runner.brew_install")
    mocker.patch("devlair.modules.devtools.runner.apt_install")
    mocker.patch("devlair.modules.devtools.runner.run_shell_as")
    mocker.patch("devlair.modules.devtools.runner.run_shell")
    mocker.patch("devlair.modules.devtools.runner.run")
    mocker.patch("devlair.modules.devtools.runner.get_output", return_value="")
    mocker.patch("devlair.modules.devtools.runner.download_script", return_value=MagicMock(unlink=lambda **kw: None))
    mocker.patch(
        "devlair.modules.devtools.runner.safe_tempfile",
        return_value=MagicMock(exists=lambda: False, unlink=lambda **kw: None),
    )
    mocker.patch("devlair.modules.devtools.safe_log_install")
    mocker.patch("devlair.modules.devtools.console.print")
    return mocker


def test_pyenv_uses_brew_on_macos(mock_runner, tmp_path):
    mock_runner.patch("devlair.modules.devtools.runner.cmd_exists", return_value=False)
    brew_install = mock_runner.patch("devlair.modules.devtools.runner.brew_install")
    apt_install = mock_runner.patch("devlair.modules.devtools.runner.apt_install")
    # pyenv dir does not exist → will try to install
    ctx = _ctx("macos", tmp_path)

    devtools.run(ctx)

    brew_install.assert_any_call("openssl", "readline", "sqlite3", "xz", "zlib", quiet=True)
    apt_install.assert_not_called()


def test_pyenv_uses_apt_on_linux(mock_runner, tmp_path):
    mock_runner.patch("devlair.modules.devtools.runner.cmd_exists", return_value=False)
    brew_install = mock_runner.patch("devlair.modules.devtools.runner.brew_install")
    apt_install = mock_runner.patch("devlair.modules.devtools.runner.apt_install")
    ctx = _ctx("linux", tmp_path)

    devtools.run(ctx)

    apt_install.assert_called_once()
    brew_install.assert_not_called()


@pytest.mark.parametrize("platform", ["macos", "wsl"])
def test_docker_skipped(mock_runner, tmp_path, platform):
    mock_runner.patch(
        "devlair.modules.devtools.runner.cmd_exists",
        side_effect=lambda cmd: cmd != "docker",
    )
    ctx = _ctx(platform, tmp_path)

    result = devtools.run(ctx)

    assert "docker" in result.detail
    assert "skipped" in result.detail


def test_gh_uses_brew_on_macos(mock_runner, tmp_path):
    brew_install = mock_runner.patch("devlair.modules.devtools.runner.brew_install")
    mock_runner.patch(
        "devlair.modules.devtools.runner.cmd_exists",
        side_effect=lambda cmd: cmd != "gh",
    )
    ctx = _ctx("macos", tmp_path)

    devtools.run(ctx)

    brew_install.assert_any_call("gh", quiet=True)


def test_aws_uses_brew_on_macos(mock_runner, tmp_path):
    brew_install = mock_runner.patch("devlair.modules.devtools.runner.brew_install")
    mock_runner.patch(
        "devlair.modules.devtools.runner.cmd_exists",
        side_effect=lambda cmd: cmd != "aws",
    )
    ctx = _ctx("macos", tmp_path)

    devtools.run(ctx)

    brew_install.assert_any_call("awscli", quiet=True)


def test_aws_uses_uname_arch_on_linux(mock_runner, tmp_path):
    mock_runner.patch(
        "devlair.modules.devtools.runner.get_output",
        side_effect=lambda cmd: "aarch64" if "uname" in cmd else "",
    )
    run_shell = mock_runner.patch("devlair.modules.devtools.runner.run_shell")
    mock_runner.patch(
        "devlair.modules.devtools.runner.cmd_exists",
        side_effect=lambda cmd: cmd != "aws",
    )
    ctx = _ctx("linux", tmp_path)

    devtools.run(ctx)

    shell_calls = " ".join(str(c) for c in run_shell.call_args_list)
    assert "aarch64" in shell_calls
    assert "dpkg" not in shell_calls


def test_aws_x86_fallback_on_linux(mock_runner, tmp_path):
    mock_runner.patch("devlair.modules.devtools.runner.get_output", return_value="x86_64")
    run_shell = mock_runner.patch("devlair.modules.devtools.runner.run_shell")
    mock_runner.patch(
        "devlair.modules.devtools.runner.cmd_exists",
        side_effect=lambda cmd: cmd != "aws",
    )
    ctx = _ctx("linux", tmp_path)

    devtools.run(ctx)

    shell_calls = " ".join(str(c) for c in run_shell.call_args_list)
    assert "x86_64" in shell_calls
