import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

Platform = Literal["linux", "wsl", "macos"]


def detect_platform() -> Platform:
    """Detect the current platform: linux, wsl, or macos."""
    if os.environ.get("WSL_DISTRO_NAME"):
        return "wsl"
    try:
        proc_version = Path("/proc/version").read_text().lower()
        if "microsoft" in proc_version:
            return "wsl"
    except OSError:
        pass
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def detect_wsl_version(platform: Platform | None = None) -> int | None:
    """Return 1 or 2 for WSL, None otherwise."""
    if (platform or detect_platform()) != "wsl":
        return None
    try:
        proc_version = Path("/proc/version").read_text()
        if "WSL2" in proc_version or "microsoft-standard" in proc_version.lower():
            return 2
    except OSError:
        pass
    return 1


@dataclass
class SetupContext:
    username: str
    user_home: Path
    platform: Platform = field(default="linux")
    wsl_version: int | None = field(default=None)


@dataclass
class ModuleResult:
    status: Literal["ok", "warn", "skip", "fail"]
    detail: str = ""


@dataclass
class CheckItem:
    label: str
    status: Literal["ok", "warn", "fail"]
    detail: str = ""


def resolve_invoking_user() -> tuple[str, Path]:
    """Return (username, home_dir) for the real user behind sudo."""
    import os
    import pwd

    username = os.environ.get("SUDO_USER", "")
    if not username or username == "root":
        username = pwd.getpwnam(os.environ.get("USER", "root")).pw_name
    user_home = Path(pwd.getpwnam(username).pw_dir)
    return username, user_home


def read_json(path: Path) -> dict:
    """Read a JSON config file, returning {} on missing or corrupt files."""
    import json

    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text()) or {}
    except (json.JSONDecodeError, OSError):
        return {}


def update_json(path: Path, updates: dict) -> None:
    """Merge updates into a JSON config file, preserving existing keys."""
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    data = read_json(path)
    data.update(updates)
    path.write_text(json.dumps(data, indent=2) + "\n")
