from dataclasses import dataclass, field
from types import ModuleType

from devlair.modules import (
    claude,
    devtools,
    firewall,
    github,
    gnome_terminal,
    rclone,
    shell,
    ssh,
    system,
    tailscale,
    timezone,
    tmux,
    zsh,
)

GROUPS = ("core", "network", "coding", "cloud-sync", "ai", "desktop")


@dataclass
class ModuleSpec:
    key: str
    label: str
    module: ModuleType
    group: str
    deps: list[str] = field(default_factory=list)
    reapply: bool = False
    platforms: set[str] = field(default_factory=lambda: {"linux", "wsl"})
    default_on: set[str] | None = None  # None → same as platforms


# fmt: off
MODULE_SPECS: list[ModuleSpec] = [
    ModuleSpec("system",         "System update",          system,         "core"),
    ModuleSpec("timezone",       "Timezone",               timezone,       "core",                                    platforms={"linux"}),
    ModuleSpec("tailscale",      "Tailscale",              tailscale,      "network",                                 default_on={"linux"}),
    ModuleSpec("ssh",            "SSH",                    ssh,            "network",     deps=["tailscale"],        platforms={"linux"}),
    ModuleSpec("firewall",       "Firewall + Fail2Ban",    firewall,       "network",     deps=["ssh"],              platforms={"linux"}),
    ModuleSpec("zsh",            "Zsh + Dracula",          zsh,            "core",        reapply=True),
    ModuleSpec("tmux",           "tmux",                   tmux,           "coding",      reapply=True),
    ModuleSpec("devtools",       "Dev tools",              devtools,       "coding",      reapply=True),
    ModuleSpec("rclone",         "rclone sync",            rclone,         "cloud-sync",                              default_on=set()),
    ModuleSpec("github",         "GitHub SSH key",         github,         "coding"),
    ModuleSpec("shell",          "Shell aliases",          shell,          "core",        deps=["zsh"], reapply=True),
    ModuleSpec("gnome_terminal", "Gnome Terminal Dracula", gnome_terminal, "desktop",     reapply=True,              platforms={"linux"}),
    ModuleSpec("claude",         "Claude Code",            claude,         "ai",          deps=["devtools"], reapply=True, default_on=set()),
]
# fmt: on

REAPPLY_KEYS = {s.key for s in MODULE_SPECS if s.reapply}

_SPEC_MAP = {s.key: s for s in MODULE_SPECS}


def _validate_dag() -> None:
    """Assert that MODULE_SPECS is in valid dependency order."""
    seen: set[str] = set()
    for s in MODULE_SPECS:
        for dep in s.deps:
            if dep not in _SPEC_MAP:
                raise ValueError(f"Module '{s.key}' depends on unknown module '{dep}'")
            if dep not in seen:
                raise ValueError(f"Module '{s.key}' depends on '{dep}' which appears later in MODULE_SPECS")
        seen.add(s.key)


_validate_dag()


def resolve_order(keys: set[str] | None = None, platform: str | None = None) -> list[ModuleSpec]:
    """Return ModuleSpecs in dependency-safe order, optionally filtered to keys.

    If keys is provided, dependencies are pulled in automatically.
    If platform is provided, modules incompatible with it are excluded.
    """
    if keys is not None:
        expanded: set[str] = set()

        def _expand(k: str) -> None:
            if k in expanded:
                return
            expanded.add(k)
            for dep in _SPEC_MAP[k].deps:
                _expand(dep)

        for k in keys:
            _expand(k)
        keys = expanded

    specs = [s for s in MODULE_SPECS if keys is None or s.key in keys]
    if platform is not None:
        specs = [s for s in specs if platform in s.platforms]
    return specs


def keys_for_groups(groups: set[str]) -> set[str]:
    """Return all module keys belonging to the given groups."""
    return {s.key for s in MODULE_SPECS if s.group in groups}
