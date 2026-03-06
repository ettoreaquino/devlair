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
