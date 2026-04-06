"""YAML profile loading, validation, and module key resolution."""

from pathlib import Path

import yaml


class ProfileError(Exception):
    """Raised when a profile fails validation."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def load_profile(path: Path) -> dict:
    """Load a YAML profile from disk. Raises ProfileError on failure."""
    if not path.exists():
        raise ProfileError(f"Profile not found: {path}")
    try:
        data = yaml.safe_load(path.read_text())
    except yaml.YAMLError as exc:
        raise ProfileError(f"Invalid YAML in {path}: {exc}")
    if not isinstance(data, dict):
        raise ProfileError(f"Profile must be a YAML mapping, got {type(data).__name__}")
    return data


def validate_profile(data: dict) -> dict:
    """Validate profile structure. Raises ProfileError on invalid data."""
    from devlair.modules import _SPEC_MAP, GROUPS

    version = data.get("version")
    if version != 1:
        raise ProfileError(f"Unsupported profile version: {version!r} (expected 1)")

    name = data.get("name")
    if name is not None and not isinstance(name, str):
        raise ProfileError(f"'name' must be a string, got {type(name).__name__}")

    groups = data.get("groups")
    if groups is not None:
        if not isinstance(groups, list):
            raise ProfileError(f"'groups' must be a list, got {type(groups).__name__}")
        for g in groups:
            if g not in GROUPS:
                raise ProfileError(f"Unknown group '{g}'. Valid groups: {', '.join(GROUPS)}")

    modules = data.get("modules")
    if modules is not None:
        if not isinstance(modules, list):
            raise ProfileError(f"'modules' must be a list, got {type(modules).__name__}")
        for m in modules:
            if m not in _SPEC_MAP:
                raise ProfileError(f"Unknown module '{m}'. Valid modules: {', '.join(sorted(_SPEC_MAP))}")

    skip = data.get("skip")
    if skip is not None:
        if not isinstance(skip, list):
            raise ProfileError(f"'skip' must be a list, got {type(skip).__name__}")
        for s in skip:
            if s not in _SPEC_MAP:
                raise ProfileError(f"Unknown module '{s}' in skip list")

    config = data.get("config")
    if config is not None:
        if not isinstance(config, dict):
            raise ProfileError(f"'config' must be a mapping, got {type(config).__name__}")
        for key, val in config.items():
            if key not in _SPEC_MAP:
                raise ProfileError(f"Unknown module '{key}' in config section")
            if not isinstance(val, dict):
                raise ProfileError(f"Config for '{key}' must be a mapping, got {type(val).__name__}")

    return data


def resolve_profile_keys(data: dict) -> tuple[set[str] | None, set[str]]:
    """Derive (want, skip_set) from a validated profile.

    Returns:
        want: set of module keys to include, or None for all modules.
        skip_set: set of module keys to exclude.
    """
    from devlair.modules import keys_for_groups

    want: set[str] | None = None
    if "modules" in data:
        want = set(data["modules"])
    elif "groups" in data:
        want = keys_for_groups(set(data["groups"]))

    skip_set = set(data.get("skip", []))
    return want, skip_set
