from devlair.modules import (
    claude,
    claw,
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

# (key, display label, module)
MODULES = [
    ("system", "System update", system),
    ("timezone", "Timezone", timezone),
    ("tailscale", "Tailscale", tailscale),
    ("ssh", "SSH", ssh),
    ("firewall", "Firewall + Fail2Ban", firewall),
    ("zsh", "Zsh + Dracula", zsh),
    ("tmux", "tmux", tmux),
    ("devtools", "Dev tools", devtools),
    ("rclone", "rclone sync", rclone),
    ("github", "GitHub SSH key", github),
    ("shell", "Shell aliases", shell),
    ("gnome_terminal", "Gnome Terminal Dracula", gnome_terminal),
    ("claude", "Claude Code", claude),
    ("claw", "PicoCLAW Agent", claw),
]

# Modules whose run() is idempotent and safe to re-apply after upgrades
# (may install missing deps and re-sync configs)
REAPPLY_KEYS = {"zsh", "tmux", "devtools", "shell", "gnome_terminal", "claude", "claw"}
