"""
Integration tests that run inside a Docker Ubuntu 24.04 container.
They test the actual module behaviour on a real (but isolated) system.

Only non-interactive, non-systemd modules are exercised:
  - tmux  : writes .tmux.conf
  - shell : writes .zshrc aliases

The SUDO_USER env var must be set to a valid user before running
(the Dockerfile sets it to 'testuser').
"""

import os
import pwd
from pathlib import Path

import pytest

from devlair.context import SetupContext
from devlair.modules import shell, tmux

# ── helpers ───────────────────────────────────────────────────────────────────


def _get_ctx() -> SetupContext:
    username = os.environ.get("SUDO_USER", "")
    if not username:
        pytest.skip("SUDO_USER not set — run inside Docker via tests/integration/run.sh")
    try:
        user_home = Path(pwd.getpwnam(username).pw_dir)
    except KeyError:
        pytest.skip(f"User '{username}' does not exist in this environment")
    return SetupContext(username=username, user_home=user_home)


# ── tmux ──────────────────────────────────────────────────────────────────────


class TestTmuxIntegration:
    def test_creates_tmux_conf(self):
        ctx = _get_ctx()
        result = tmux.run(ctx)
        conf = ctx.user_home / ".tmux.conf"

        assert conf.exists()
        assert result.status == "ok"

    def test_dracula_colors_present(self):
        ctx = _get_ctx()
        tmux.run(ctx)
        content = (ctx.user_home / ".tmux.conf").read_text()

        for color in ["#282a36", "#bd93f9", "#50fa7b", "#ff5555"]:
            assert color in content, f"Dracula color {color} missing"

    def test_idempotent(self):
        ctx = _get_ctx()
        tmux.run(ctx)
        first = (ctx.user_home / ".tmux.conf").read_text()

        tmux.run(ctx)
        second = (ctx.user_home / ".tmux.conf").read_text()

        assert first == second


# ── shell ─────────────────────────────────────────────────────────────────────


class TestShellIntegration:
    def test_creates_zshrc(self):
        ctx = _get_ctx()
        # Ensure clean slate
        zshrc = ctx.user_home / ".zshrc"
        if zshrc.exists():
            zshrc.unlink()

        result = shell.run(ctx)
        assert zshrc.exists()
        assert result.status == "ok"

    def test_aliases_present(self):
        ctx = _get_ctx()
        zshrc = ctx.user_home / ".zshrc"
        if zshrc.exists():
            zshrc.unlink()

        shell.run(ctx)
        content = zshrc.read_text()

        for alias in ["alias ll=", "alias t=", "alias ts=", "alias ports="]:
            assert alias in content

    def test_idempotent_no_duplicate_marker(self):
        ctx = _get_ctx()
        zshrc = ctx.user_home / ".zshrc"
        if zshrc.exists():
            zshrc.unlink()

        shell.run(ctx)
        shell.run(ctx)  # second run should skip

        content = zshrc.read_text()
        assert content.count(shell.MARKER) == 1

    def test_appends_to_existing_zshrc(self):
        ctx = _get_ctx()
        zshrc = ctx.user_home / ".zshrc"
        zshrc.write_text("# pre-existing line\n")

        shell.run(ctx)
        content = zshrc.read_text()

        assert "# pre-existing line" in content
        assert shell.MARKER in content
