"""Tests for the self-update release resolution in features/upgrade.

Regression coverage for the v1 -> v3 upgrade 404: a v1 binary resolved the
absolute-latest release (now v3) and tried to download the old `devlair-<arch>`
asset, which no longer exists on v2+ releases (renamed `devlair-cli-<arch>`).
"""

from devlair.features import upgrade


def _rel(tag: str, *, draft: bool = False, prerelease: bool = False) -> dict:
    return {"tag_name": tag, "draft": draft, "prerelease": prerelease}


def test_version_tuple_parses_and_stops_at_nonnumeric():
    assert upgrade._version_tuple("1.8.0") == (1, 8, 0)
    assert upgrade._version_tuple("v3.0.0".removeprefix("v")) == (3, 0, 0)
    assert upgrade._version_tuple("1.2.0-rc1") == (1, 2, 0)  # suffix stripped from patch
    assert upgrade._version_tuple("1.x.0") == (1,)  # stops at first non-numeric component
    assert upgrade._version_tuple("garbage") == ()


def test_pick_update_flags_newer_major_for_v1_install():
    # The exact scenario that 404'd: on v1.1.0 with v3 released.
    releases = [_rel("v3.0.0"), _rel("v2.12.1"), _rel("v1.8.0"), _rel("v1.1.0")]
    latest_same_major, newer_major = upgrade._pick_update(releases, "1.1.0")

    assert newer_major is True
    # The latest same-major (v1) release is still resolved, but the caller
    # redirects to install.sh because a newer major exists.
    assert latest_same_major == "1.8.0"


def test_pick_update_in_major_only():
    releases = [_rel("v1.8.0"), _rel("v1.2.0"), _rel("v1.1.0")]
    latest_same_major, newer_major = upgrade._pick_update(releases, "1.1.0")

    assert newer_major is False
    assert latest_same_major == "1.8.0"


def test_pick_update_already_latest_in_major():
    releases = [_rel("v1.8.0"), _rel("v1.1.0")]
    latest_same_major, newer_major = upgrade._pick_update(releases, "1.8.0")

    assert newer_major is False
    assert latest_same_major == "1.8.0"


def test_pick_update_picks_highest_regardless_of_list_order():
    # GitHub usually returns newest-first, but don't rely on it.
    releases = [_rel("v1.1.0"), _rel("v1.8.0"), _rel("v1.2.0")]
    latest_same_major, _ = upgrade._pick_update(releases, "1.1.0")

    assert latest_same_major == "1.8.0"


def test_pick_update_ignores_drafts_and_prereleases():
    releases = [
        _rel("v2.0.0-rc1", prerelease=True),
        _rel("v1.9.0", draft=True),
        _rel("v1.8.0"),
    ]
    latest_same_major, newer_major = upgrade._pick_update(releases, "1.1.0")

    assert newer_major is False  # the only v2 entry is a prerelease
    assert latest_same_major == "1.8.0"  # the v1.9.0 draft is ignored


def test_pick_update_unparseable_current_is_safe():
    releases = [_rel("v3.0.0")]
    latest_same_major, newer_major = upgrade._pick_update(releases, "dev")

    assert latest_same_major is None
    assert newer_major is False
