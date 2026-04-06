"""Tests for audit logging."""

import json
import os

from devlair.features.audit import log_event, log_module_result, log_tool_install, read_log


class TestLogEvent:
    def test_creates_directory_and_file(self, tmp_path):
        home = tmp_path / "user"
        log_event(home, event="test")
        assert (home / ".devlair" / "audit.json").exists()

    def test_appends_json_lines(self, tmp_path):
        log_event(tmp_path, event="first")
        log_event(tmp_path, event="second")
        lines = (tmp_path / ".devlair" / "audit.json").read_text().strip().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[0])["event"] == "first"
        assert json.loads(lines[1])["event"] == "second"

    def test_includes_timestamp(self, tmp_path):
        log_event(tmp_path, event="check")
        entries = read_log(tmp_path)
        assert "ts" in entries[0]

    def test_includes_detail(self, tmp_path):
        log_event(tmp_path, event="install", detail={"tool": "uv"})
        entries = read_log(tmp_path)
        assert entries[0]["detail"] == {"tool": "uv"}

    def test_omits_detail_when_none(self, tmp_path):
        log_event(tmp_path, event="bare")
        entries = read_log(tmp_path)
        assert "detail" not in entries[0]

    def test_file_permissions_restricted(self, tmp_path):
        log_event(tmp_path, event="secret")
        path = tmp_path / ".devlair" / "audit.json"
        mode = os.stat(path).st_mode & 0o777
        assert mode == 0o600


class TestLogToolInstall:
    def test_logs_tool_event(self, tmp_path):
        log_tool_install(tmp_path, tool="docker", source="apt:docker.com", verified=True)
        entries = read_log(tmp_path)
        assert entries[0]["event"] == "tool_install"
        assert entries[0]["detail"]["tool"] == "docker"
        assert entries[0]["detail"]["verified"] is True

    def test_unverified_default(self, tmp_path):
        log_tool_install(tmp_path, tool="uv", source="astral.sh")
        entries = read_log(tmp_path)
        assert entries[0]["detail"]["verified"] is False


class TestLogModuleResult:
    def test_logs_module_event(self, tmp_path):
        log_module_result(tmp_path, module="system", status="ok", detail="all good")
        entries = read_log(tmp_path)
        assert entries[0]["event"] == "module_result"
        assert entries[0]["detail"]["module"] == "system"
        assert entries[0]["detail"]["status"] == "ok"


class TestReadLog:
    def test_empty_when_no_file(self, tmp_path):
        assert read_log(tmp_path) == []

    def test_reads_all_entries(self, tmp_path):
        log_event(tmp_path, event="a")
        log_event(tmp_path, event="b")
        log_event(tmp_path, event="c")
        assert len(read_log(tmp_path)) == 3


class TestAuditResilience:
    def test_log_event_raises_on_read_only_dir(self, tmp_path):
        """Audit functions raise when the target is not writable.

        The safe_log_install() wrapper catches this so init doesn't break.
        """
        ro_dir = tmp_path / "readonly"
        ro_dir.mkdir()
        os.chmod(ro_dir, 0o444)
        try:
            with __import__("pytest").raises(PermissionError):
                log_event(ro_dir, event="boom")
        finally:
            os.chmod(ro_dir, 0o755)

    def test_safe_log_install_swallows_errors(self, tmp_path):
        """safe_log_install must not propagate exceptions."""
        from devlair.features.audit import safe_log_install

        ro_dir = tmp_path / "readonly"
        ro_dir.mkdir()
        os.chmod(ro_dir, 0o444)
        try:
            safe_log_install(ro_dir, tool="uv", source="test")  # should not raise
        finally:
            os.chmod(ro_dir, 0o755)
