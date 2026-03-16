from devlair.modules import (
    system,
    timezone,
    tailscale,
    ssh,
    firewall,
    zsh,
    tmux,
    devtools,
    github,
    shell,
    gnome_terminal,
    claude,
)

# (key, display label, module)
MODULES = [
    ("system",         "System update",           system),
    ("timezone",       "Timezone",                timezone),
    ("tailscale",      "Tailscale",               tailscale),
    ("ssh",            "SSH",                     ssh),
    ("firewall",       "Firewall + Fail2Ban",     firewall),
    ("zsh",            "Zsh + Dracula",           zsh),
    ("tmux",           "tmux",                    tmux),
    ("devtools",       "Dev tools",               devtools),
    ("github",         "GitHub SSH key",          github),
    ("shell",          "Shell aliases",           shell),
    ("gnome_terminal", "Gnome Terminal Dracula",  gnome_terminal),
    ("claude",         "Claude Code",             claude),
]
