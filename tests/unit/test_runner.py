"""Tests for runner utilities — checksum verification and safe temp files."""

import hashlib

import pytest

from devlair.runner import ChecksumError, safe_tempfile, sha256_file, verify_checksum


class TestSha256File:
    def test_computes_correct_hash(self, tmp_path):
        f = tmp_path / "hello.bin"
        f.write_bytes(b"hello world")
        expected = hashlib.sha256(b"hello world").hexdigest()
        assert sha256_file(f) == expected

    def test_empty_file(self, tmp_path):
        f = tmp_path / "empty"
        f.write_bytes(b"")
        expected = hashlib.sha256(b"").hexdigest()
        assert sha256_file(f) == expected

    def test_large_file(self, tmp_path):
        """Verify chunked reading works for files larger than buffer size."""
        data = b"x" * (1 << 17)  # 128 KiB — larger than the 64 KiB chunk
        f = tmp_path / "large.bin"
        f.write_bytes(data)
        expected = hashlib.sha256(data).hexdigest()
        assert sha256_file(f) == expected


class TestVerifyChecksum:
    def test_valid_checksum_passes(self, tmp_path):
        f = tmp_path / "good.bin"
        f.write_bytes(b"devlair")
        expected = hashlib.sha256(b"devlair").hexdigest()
        verify_checksum(f, expected)  # should not raise

    def test_uppercase_checksum_accepted(self, tmp_path):
        f = tmp_path / "upper.bin"
        f.write_bytes(b"devlair")
        expected = hashlib.sha256(b"devlair").hexdigest().upper()
        verify_checksum(f, expected)  # should not raise

    def test_checksum_with_whitespace_accepted(self, tmp_path):
        f = tmp_path / "ws.bin"
        f.write_bytes(b"devlair")
        expected = hashlib.sha256(b"devlair").hexdigest() + "  \n"
        verify_checksum(f, expected)  # should not raise

    def test_tampered_file_raises(self, tmp_path):
        f = tmp_path / "bad.bin"
        f.write_bytes(b"tampered content")
        wrong_hash = hashlib.sha256(b"original content").hexdigest()
        with pytest.raises(ChecksumError, match="SHA-256 mismatch"):
            verify_checksum(f, wrong_hash)

    def test_error_includes_filename(self, tmp_path):
        f = tmp_path / "myfile.zip"
        f.write_bytes(b"data")
        with pytest.raises(ChecksumError, match="myfile.zip"):
            verify_checksum(f, "0" * 64)


class TestSafeTempfile:
    def test_creates_file_that_exists(self):
        path = safe_tempfile(suffix=".sh")
        try:
            assert path.exists()
            assert path.name.endswith(".sh")
        finally:
            path.unlink(missing_ok=True)

    def test_different_calls_return_different_paths(self):
        a = safe_tempfile()
        b = safe_tempfile()
        try:
            assert a != b
        finally:
            a.unlink(missing_ok=True)
            b.unlink(missing_ok=True)

    def test_file_is_writable(self):
        path = safe_tempfile(suffix=".txt")
        try:
            path.write_text("hello")
            assert path.read_text() == "hello"
        finally:
            path.unlink(missing_ok=True)
