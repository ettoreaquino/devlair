from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "Gnome Terminal Dracula"

# Dracula palette for Gnome Terminal (dconf format)
# https://draculatheme.com/gnome-terminal
DRACULA_PALETTE = [
    "#282a36", "#ff5555", "#50fa7b", "#f1fa8c",
    "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
    "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5",
    "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
]

PROFILE_SCHEMA = "org.gnome.Terminal.Legacy.Profile"


def run(ctx: SetupContext) -> ModuleResult:
    if not runner.cmd_exists("gsettings"):
        return ModuleResult(status="skip", detail="gsettings not available")

    profile_id = runner.get_output(
        "gsettings get org.gnome.Terminal.ProfilesList default"
    ).strip("' \n")

    if not profile_id:
        return ModuleResult(status="skip", detail="no default terminal profile found")

    path = f"/org/gnome/terminal/legacy/profiles:/:{profile_id}/"

    palette_str = "[" + ", ".join(f"'{c}'" for c in DRACULA_PALETTE) + "]"

    dconf_settings = {
        "visible-name": "'Devlair Dracula'",
        "background-color": "'#282a36'",
        "foreground-color": "'#f8f8f2'",
        "bold-color": "'#6272a4'",
        "bold-color-same-as-fg": "false",
        "palette": palette_str,
        "use-theme-colors": "false",
        "use-theme-transparency": "false",
    }

    dbus_env = "export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus"

    for key, value in dconf_settings.items():
        runner.run_shell_as(
            ctx.username,
            f'{dbus_env}; dconf write {path}{key} "{value}"',
            quiet=True,
        )

    return ModuleResult(status="ok", detail="Dracula colors applied to Gnome Terminal")


def check() -> list[CheckItem]:
    if not runner.cmd_exists("gsettings"):
        return [CheckItem(label="gnome-terminal", status="warn", detail="gsettings missing")]

    profile_id = runner.get_output(
        "gsettings get org.gnome.Terminal.ProfilesList default"
    ).strip("' \n")

    if not profile_id:
        return [CheckItem(label="gnome-terminal", status="warn", detail="no profile")]

    path = f"/org/gnome/terminal/legacy/profiles:/:{profile_id}/"
    bg = runner.get_output(f"dconf read {path}background-color")
    ok = "#282a36" in bg
    return [CheckItem(label="gnome-terminal Dracula", status="ok" if ok else "warn")]
