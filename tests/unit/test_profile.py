"""Tests for YAML profile loading, validation, and key resolution."""

import pytest

from devlair.features.profile import (
    ProfileError,
    load_profile,
    resolve_profile_keys,
    validate_profile,
)


class TestLoadProfile:
    def test_load_valid_yaml(self, tmp_path):
        f = tmp_path / "profile.yaml"
        f.write_text("version: 1\nname: test\n")
        data = load_profile(f)
        assert data == {"version": 1, "name": "test"}

    def test_load_nonexistent_raises(self, tmp_path):
        with pytest.raises(ProfileError, match="not found"):
            load_profile(tmp_path / "missing.yaml")

    def test_load_invalid_yaml_raises(self, tmp_path):
        f = tmp_path / "bad.yaml"
        f.write_text(":\n  - :\n  invalid: [")
        with pytest.raises(ProfileError, match="Invalid YAML"):
            load_profile(f)

    def test_load_non_mapping_raises(self, tmp_path):
        f = tmp_path / "list.yaml"
        f.write_text("- item1\n- item2\n")
        with pytest.raises(ProfileError, match="must be a YAML mapping"):
            load_profile(f)


class TestValidateProfile:
    def test_valid_minimal(self):
        validate_profile({"version": 1})

    def test_valid_full(self):
        data = {
            "version": 1,
            "name": "full-profile",
            "groups": ["core", "coding"],
            "skip": ["system"],
            "config": {"github": {"email": "a@b.com"}},
        }
        result = validate_profile(data)
        assert result is data

    def test_missing_version_raises(self):
        with pytest.raises(ProfileError, match="Unsupported profile version"):
            validate_profile({})

    def test_wrong_version_raises(self):
        with pytest.raises(ProfileError, match="expected 1"):
            validate_profile({"version": 2})

    def test_invalid_group_raises(self):
        with pytest.raises(ProfileError, match="Unknown group 'bogus'"):
            validate_profile({"version": 1, "groups": ["core", "bogus"]})

    def test_invalid_module_raises(self):
        with pytest.raises(ProfileError, match="Unknown module 'bogus'"):
            validate_profile({"version": 1, "modules": ["system", "bogus"]})

    def test_invalid_skip_key_raises(self):
        with pytest.raises(ProfileError, match="Unknown module 'bogus' in skip"):
            validate_profile({"version": 1, "skip": ["bogus"]})

    def test_invalid_config_key_raises(self):
        with pytest.raises(ProfileError, match="Unknown module 'bogus' in config"):
            validate_profile({"version": 1, "config": {"bogus": {}}})

    def test_config_value_must_be_dict(self):
        with pytest.raises(ProfileError, match="must be a mapping"):
            validate_profile({"version": 1, "config": {"github": "not-a-dict"}})

    def test_groups_must_be_list(self):
        with pytest.raises(ProfileError, match="must be a list"):
            validate_profile({"version": 1, "groups": "core"})

    def test_name_must_be_string(self):
        with pytest.raises(ProfileError, match="must be a string"):
            validate_profile({"version": 1, "name": 123})


class TestResolveProfileKeys:
    def test_modules_override_groups(self):
        data = {"version": 1, "modules": ["system", "zsh"], "groups": ["coding"]}
        want, skip_set = resolve_profile_keys(data)
        assert want == {"system", "zsh"}
        assert skip_set == set()

    def test_groups_produce_correct_keys(self):
        data = {"version": 1, "groups": ["core"]}
        want, skip_set = resolve_profile_keys(data)
        assert want == {"system", "timezone", "zsh", "shell"}

    def test_no_selection_returns_none(self):
        data = {"version": 1}
        want, skip_set = resolve_profile_keys(data)
        assert want is None
        assert skip_set == set()

    def test_skip_returned(self):
        data = {"version": 1, "skip": ["system", "tmux"]}
        want, skip_set = resolve_profile_keys(data)
        assert skip_set == {"system", "tmux"}

    def test_modules_exact_keys(self):
        data = {"version": 1, "modules": ["devtools", "github"]}
        want, _ = resolve_profile_keys(data)
        assert want == {"devtools", "github"}
