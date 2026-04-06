"""Audit logging — JSON Lines to ~/.devlair/audit.json."""

import json
import os
import time
from pathlib import Path


def _audit_path(user_home: Path) -> Path:
    return user_home / ".devlair" / "audit.json"


def log_event(
    user_home: Path,
    *,
    event: str,
    detail: dict | None = None,
) -> None:
    """Append a single audit event as a JSON Lines entry."""
    path = _audit_path(user_home)
    path.parent.mkdir(parents=True, exist_ok=True)

    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "event": event,
    }
    if detail:
        entry["detail"] = detail

    with open(path, "a") as f:
        f.write(json.dumps(entry, separators=(",", ":")) + "\n")

    # Restrict permissions on first write
    if os.stat(path).st_mode & 0o77:
        os.chmod(path, 0o600)


def log_tool_install(user_home: Path, *, tool: str, source: str, verified: bool = False) -> None:
    """Log a tool installation event."""
    log_event(user_home, event="tool_install", detail={"tool": tool, "source": source, "verified": verified})


def log_module_result(user_home: Path, *, module: str, status: str, detail: str = "") -> None:
    """Log a module run result."""
    log_event(user_home, event="module_result", detail={"module": module, "status": status, "detail": detail})


def read_log(user_home: Path) -> list[dict]:
    """Read all audit entries. Returns empty list if no log exists."""
    path = _audit_path(user_home)
    if not path.exists():
        return []
    entries = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            entries.append(json.loads(line))
    return entries
