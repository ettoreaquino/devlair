"""Tests for platform detection."""

from pathlib import Path
from unittest.mock import patch

from devlair.context import detect_platform, detect_wsl_version


class TestDetectPlatform:
    def test_detect_linux_default(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(Path, "read_text", side_effect=OSError),
            patch("devlair.context.sys") as mock_sys,
        ):
            mock_sys.platform = "linux"
            assert detect_platform() == "linux"

    def test_detect_wsl_via_env(self):
        with patch.dict("os.environ", {"WSL_DISTRO_NAME": "Ubuntu"}, clear=True):
            assert detect_platform() == "wsl"

    def test_detect_wsl_via_proc_version(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(Path, "read_text", return_value="Linux version 5.15.0 microsoft-standard-WSL2"),
        ):
            assert detect_platform() == "wsl"

    def test_detect_macos(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(Path, "read_text", side_effect=OSError),
            patch("devlair.context.sys") as mock_sys,
        ):
            mock_sys.platform = "darwin"
            assert detect_platform() == "macos"

    def test_detect_not_wsl_when_no_signal(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(Path, "read_text", return_value="Linux version 6.17.0-19-generic"),
            patch("devlair.context.sys") as mock_sys,
        ):
            mock_sys.platform = "linux"
            assert detect_platform() == "linux"


class TestDetectWslVersion:
    def test_wsl2_detected(self):
        with (
            patch.dict("os.environ", {"WSL_DISTRO_NAME": "Ubuntu"}, clear=True),
            patch.object(Path, "read_text", return_value="Linux version 5.15.0 microsoft-standard-WSL2"),
        ):
            assert detect_wsl_version() == 2

    def test_wsl1_detected(self):
        with (
            patch.dict("os.environ", {"WSL_DISTRO_NAME": "Ubuntu"}, clear=True),
            patch.object(Path, "read_text", return_value="Linux version 4.4.0-Microsoft"),
        ):
            assert detect_wsl_version() == 1

    def test_none_on_linux(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(Path, "read_text", return_value="Linux version 6.17.0-19-generic"),
            patch("devlair.context.sys") as mock_sys,
        ):
            mock_sys.platform = "linux"
            assert detect_wsl_version() is None
