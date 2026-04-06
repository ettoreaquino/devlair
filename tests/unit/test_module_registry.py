"""Tests for the module registry — groups, dependencies, and resolution."""

from devlair.modules import (
    _SPEC_MAP,
    GROUPS,
    MODULE_SPECS,
    REAPPLY_KEYS,
    keys_for_groups,
    resolve_order,
)


class TestModuleSpecs:
    def test_all_keys_unique(self):
        keys = [s.key for s in MODULE_SPECS]
        assert len(keys) == len(set(keys))

    def test_all_groups_valid(self):
        for s in MODULE_SPECS:
            assert s.group in GROUPS, f"Module '{s.key}' has unknown group '{s.group}'"

    def test_all_deps_reference_valid_modules(self):
        for s in MODULE_SPECS:
            for dep in s.deps:
                assert dep in _SPEC_MAP, f"Module '{s.key}' depends on unknown '{dep}'"

    def test_dag_order_valid(self):
        """Dependencies must appear before dependents in MODULE_SPECS."""
        seen: set[str] = set()
        for s in MODULE_SPECS:
            for dep in s.deps:
                assert dep in seen, f"'{s.key}' depends on '{dep}' which appears later"
            seen.add(s.key)

    def test_reapply_keys_match_specs(self):
        assert REAPPLY_KEYS == {s.key for s in MODULE_SPECS if s.reapply}

    def test_spec_count(self):
        assert len(MODULE_SPECS) == 14

    def test_all_specs_have_valid_platforms(self):
        valid = {"linux", "wsl", "macos"}
        for s in MODULE_SPECS:
            assert s.platforms <= valid, f"Module '{s.key}' has invalid platforms: {s.platforms - valid}"

    def test_default_platforms_include_linux_and_wsl(self):
        """Most modules should be compatible with both linux and wsl."""
        linux_only = {s.key for s in MODULE_SPECS if s.platforms == {"linux"}}
        assert linux_only == {"timezone", "ssh", "firewall", "gnome_terminal"}


class TestResolveOrder:
    def test_all_modules_when_none(self):
        result = resolve_order(None)
        assert len(result) == 14
        assert result == MODULE_SPECS

    def test_single_module_no_deps(self):
        result = resolve_order({"system"})
        assert [s.key for s in result] == ["system"]

    def test_pulls_in_deps(self):
        result = resolve_order({"shell"})
        keys = [s.key for s in result]
        assert "zsh" in keys
        assert "shell" in keys
        assert keys.index("zsh") < keys.index("shell")

    def test_transitive_deps(self):
        result = resolve_order({"firewall"})
        keys = [s.key for s in result]
        assert "tailscale" in keys
        assert "ssh" in keys
        assert "firewall" in keys
        assert keys.index("tailscale") < keys.index("ssh") < keys.index("firewall")

    def test_multiple_modules_shared_dep(self):
        result = resolve_order({"claude", "claw"})
        keys = [s.key for s in result]
        assert keys == ["devtools", "claude", "claw"]

    def test_reapply_keys_resolve(self):
        result = resolve_order(REAPPLY_KEYS)
        keys = [s.key for s in result]
        assert set(keys) >= REAPPLY_KEYS
        # zsh must come before shell
        assert keys.index("zsh") < keys.index("shell")

    def test_filters_by_platform_wsl(self):
        result = resolve_order(platform="wsl")
        keys = {s.key for s in result}
        assert "firewall" not in keys
        assert "ssh" not in keys
        assert "timezone" not in keys
        assert "gnome_terminal" not in keys
        assert "system" in keys
        assert "zsh" in keys

    def test_filters_by_platform_linux(self):
        result = resolve_order(platform="linux")
        assert len(result) == 14

    def test_no_platform_returns_all(self):
        result = resolve_order(platform=None)
        assert len(result) == 14

    def test_platform_filtered_deps_not_pulled_in(self):
        """Requesting firewall on WSL returns empty — firewall is excluded."""
        result = resolve_order({"firewall"}, platform="wsl")
        keys = {s.key for s in result}
        assert "firewall" not in keys
        # tailscale is a transitive dep but also WSL-compatible, so it stays
        assert "tailscale" in keys


class TestKeysForGroups:
    def test_core_group(self):
        assert keys_for_groups({"core"}) == {"system", "timezone", "zsh", "shell"}

    def test_network_group(self):
        assert keys_for_groups({"network"}) == {"tailscale", "ssh", "firewall"}

    def test_coding_group(self):
        assert keys_for_groups({"coding"}) == {"tmux", "devtools", "github"}

    def test_ai_group(self):
        assert keys_for_groups({"ai"}) == {"claude", "claw"}

    def test_multiple_groups(self):
        result = keys_for_groups({"core", "network"})
        assert result == {"system", "timezone", "zsh", "shell", "tailscale", "ssh", "firewall"}

    def test_empty_group(self):
        assert keys_for_groups(set()) == set()
