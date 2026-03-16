from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from enum import Enum


@dataclass
class SetupContext:
    username: str
    user_home: Path


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
