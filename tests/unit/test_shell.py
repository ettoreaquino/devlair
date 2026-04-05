"""Tests for the shell module — appends aliases to .zshrc."""

from devlair.context import SetupContext
from devlair.modules import shell


def test_run_creates_zshrc_if_missing(ctx: SetupContext):
    assert not (ctx.user_home / ".zshrc").exists()
    result = shell.run(ctx)

    assert (ctx.user_home / ".zshrc").exists()
    assert result.status == "ok"


def test_run_appends_to_existing_zshrc(ctx: SetupContext):
    zshrc = ctx.user_home / ".zshrc"
    zshrc.write_text("# existing content\n")

    shell.run(ctx)
    content = zshrc.read_text()

    assert "# existing content" in content
    assert shell.MARKER in content


def test_aliases_present(ctx: SetupContext):
    shell.run(ctx)
    content = (ctx.user_home / ".zshrc").read_text()

    for alias in ["alias ll=", "alias t=", "alias ts=", "alias ports="]:
        assert alias in content, f"Expected alias '{alias}' not found in .zshrc"


def test_nvm_and_pyenv_hooks_present(ctx: SetupContext):
    shell.run(ctx)
    content = (ctx.user_home / ".zshrc").read_text()
    assert "NVM_DIR" in content
    assert "PYENV_ROOT" in content


def test_idempotent_skip_on_second_run(ctx: SetupContext):
    """Second run should detect the marker and skip."""
    result1 = shell.run(ctx)
    content_after_first = (ctx.user_home / ".zshrc").read_text()

    result2 = shell.run(ctx)
    content_after_second = (ctx.user_home / ".zshrc").read_text()

    assert result1.status == "ok"
    assert result2.status == "ok"
    assert result2.detail == "aliases refreshed in .zshrc"
    assert content_after_first == content_after_second
    assert content_after_second.count(shell.MARKER) == 1, "Marker was written more than once"


def test_check_ok_when_marker_present(ctx: SetupContext):
    shell.run(ctx)
    # check() reads ~/.zshrc, but we're in a tmp_home — patch Path.home
    import unittest.mock as mock

    with mock.patch("pathlib.Path.home", return_value=ctx.user_home):
        items = shell.check()
    assert items[0].status == "ok"


def test_check_warn_when_marker_absent(ctx: SetupContext):
    import unittest.mock as mock

    with mock.patch("pathlib.Path.home", return_value=ctx.user_home):
        items = shell.check()
    assert items[0].status == "warn"
